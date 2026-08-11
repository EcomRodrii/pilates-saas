import { createHmac, timingSafeEqual, scryptSync, randomBytes } from 'crypto';

// Página pública oculta: el estudio puede tener su /reservar/{slug} escondido
// mientras lo prepara, y opcionalmente abrirlo con una clave que le pasa a
// quien quiera enseñárselo.
//
// ⚠️ **Qué protege esto, dicho claro, porque la diferencia importa**: oculta
// la PÁGINA, no los DATOS. El horario y los precios de un estudio se sirven
// además por su API pública, que sigue respondiendo — esto no es una cerradura
// sobre esos datos, y en este repo la cerradura real es siempre la RLS. Lo que
// sí garantiza, que es para lo que se pide: que nadie llegue por casualidad,
// que Google no lo indexe (`noindex`), y que enseñarlo antes de tiempo sea una
// decisión y no un descuido.
//
// Cero dependencias nuevas: `scrypt` y HMAC salen de `node:crypto`.

/** Namespace del token. Sin esto, un token de otra cosa firmado con el MISMO
 *  secreto valdría como acceso — el repo ya firma la vista previa del Inicio
 *  con `HOME_PREVIEW_TOKEN_SECRET`, así que el riesgo es concreto, no teórico. */
const TIPO = 'acceso-publico';

/** 30 días: es un «déjame entrar en esta página mientras la preparáis», no una
 *  sesión con datos personales detrás. Que no haya que teclearla cada día. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const SCRYPT_LONGITUD = 32;

export function nombreCookieAcceso(studioId: string): string {
  // Por estudio: entrar en el de una amiga no puede abrirte el de otra.
  return `acceso-publico-${studioId}`;
}

// ── La clave ────────────────────────────────────────────────────────────────

/**
 * Deriva el hash que se guarda en BD. Nunca se guarda la clave en claro:
 * `studios` da todas sus columnas a todo el personal del estudio por RLS, y
 * aunque aquí la sepan igualmente, una clave en claro en una tabla es un
 * patrón que acaba copiándose a sitios donde sí importa.
 *
 * Formato `scrypt$<salt hex>$<hash hex>`, autodescriptivo: si algún día se
 * cambia de algoritmo, las filas viejas siguen diciendo con cuál se generaron.
 */
export function hashearClave(clave: string, saltHex?: string): string {
  const salt = saltHex ?? randomBytes(16).toString('hex');
  const hash = scryptSync(clave.normalize('NFKC'), salt, SCRYPT_LONGITUD).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

/**
 * ⚠️ Comparación en tiempo constante y **sin salidas tempranas por longitud**
 * cuando el formato es válido: `a === b` sobre hashes filtra por cuánto tardan
 * en diferir. Es el mismo criterio que ya usa `home-preview-token.ts`.
 */
export function verificarClave(clave: string, guardado: string | null | undefined): boolean {
  if (!guardado) return false;
  const partes = guardado.split('$');
  if (partes.length !== 3 || partes[0] !== 'scrypt') return false;
  const [, salt, hashHex] = partes;
  let esperado: Buffer;
  try {
    esperado = Buffer.from(hashHex, 'hex');
  } catch {
    return false;
  }
  if (esperado.length !== SCRYPT_LONGITUD) return false;
  const calculado = scryptSync(clave.normalize('NFKC'), salt, SCRYPT_LONGITUD);
  return timingSafeEqual(esperado, calculado);
}

// ── El pase que se guarda en la cookie ──────────────────────────────────────

function secreto(): string {
  const s = process.env.HOME_PREVIEW_TOKEN_SECRET || process.env.OAUTH_STATE_SECRET;
  if (!s) throw new Error('Falta HOME_PREVIEW_TOKEN_SECRET (u OAUTH_STATE_SECRET) para firmar el acceso a la página oculta');
  return s;
}

function firmar(payloadB64: string, clave: string): string {
  return createHmac('sha256', clave).update(payloadB64).digest('base64url');
}

export function firmarAcceso(
  studioId: string,
  ahora: number = Date.now(),
  claveFirma: string = secreto(),
): string {
  const payloadB64 = Buffer.from(JSON.stringify({ tipo: TIPO, studioId, exp: ahora + TTL_MS })).toString('base64url');
  return `${payloadB64}.${firmar(payloadB64, claveFirma)}`;
}

/**
 * ¿Este pase abre ESTE estudio, ahora?
 *
 * Comprueba las tres cosas por separado a propósito: firma (que no lo haya
 * fabricado cualquiera), `tipo` (que no sea un token de otra cosa firmado con
 * el mismo secreto) y `studioId` (que no sea el de otro estudio).
 */
export function verificarAcceso(
  token: string | null | undefined,
  studioId: string,
  ahora: number = Date.now(),
  claveFirma: string = secreto(),
): boolean {
  if (!token) return false;
  const punto = token.indexOf('.');
  if (punto <= 0) return false;
  const payloadB64 = token.slice(0, punto);
  const sig = token.slice(punto + 1);

  const esperada = Buffer.from(firmar(payloadB64, claveFirma));
  const recibida = Buffer.from(sig);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return false;

  try {
    const data = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as {
      tipo?: unknown; studioId?: unknown; exp?: unknown;
    };
    if (data.tipo !== TIPO) return false;
    if (typeof data.exp !== 'number' || data.exp < ahora) return false;
    return data.studioId === studioId;
  } catch {
    return false;
  }
}

// ── La decisión ─────────────────────────────────────────────────────────────

export type VeredictoPagina = 'abierta' | 'pide-clave' | 'cerrada';

/**
 * Qué hacer con una visita, en una sola función pura.
 *
 * `cerrada` (oculta y SIN clave configurada) no enseña ningún formulario: un
 * campo de clave que no abre nada con ninguna clave es una crueldad, y además
 * invita a probar. Se dice que todavía no está disponible y ya está.
 */
export function veredictoPagina(opciones: {
  oculta: boolean;
  tieneClave: boolean;
  pase: string | null | undefined;
  studioId: string;
  ahora?: number;
  claveFirma?: string;
}): VeredictoPagina {
  if (!opciones.oculta) return 'abierta';
  const { pase, studioId, ahora, claveFirma } = opciones;
  // El pase vale aunque la clave se haya quitado después: quien ya entró no
  // debería quedarse fuera por un cambio de configuración ajeno.
  if (verificarAcceso(pase, studioId, ahora ?? Date.now(), claveFirma ?? secreto())) return 'abierta';
  return opciones.tieneClave ? 'pide-clave' : 'cerrada';
}

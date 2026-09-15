import { createHash, createHmac, timingSafeEqual, scryptSync, randomBytes } from 'crypto';

// Página pública oculta: el estudio puede tener su /reservar/{slug} escondido
// mientras lo prepara, y opcionalmente abrirlo con una clave que le pasa a
// quien quiera enseñárselo.
//
// ⚠️ **Qué protege esto, dicho claro, porque la diferencia importa**: la PÁGINA
// y lo que se ESCRIBE desde fuera. Sin el pase de la clave vigente, las rutas
// públicas que reservan, compran o dan de alta contestan 403 (`puertaPublica`,
// lib/publico/pagina-cerrada-peticion.ts) y el catálogo público no enseña
// clases. Otras lecturas públicas (aforo, huecos de citas) siguen respondiendo:
// la cerradura de los DATOS en este repo es siempre la RLS. Lo que garantiza:
// que nadie llegue por casualidad, que nadie de fuera reserve ni compre, que
// Google no lo indexe (`noindex`), y que enseñarlo antes de tiempo sea una
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

/** Tope de la clave. Ninguna clave para enseñar una página pasa de aquí, y sin
 *  tope cualquiera podría mandar textos enormes a derivar con scrypt. */
export const CLAVE_MAX = 200;

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
  // Más larga que el tope no puede ser la guardada: no se deriva.
  if (clave.length > CLAVE_MAX) return false;
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

/**
 * Huella corta de la clave GUARDADA (del hash, nunca de la clave), o `null` si
 * no hay clave. Va dentro del pase firmado y se compara al entrar: así cambiar
 * o quitar la clave cierra también a quien ya había entrado.
 *
 * sha256 sin secreto a propósito: no depende de ninguna variable de entorno
 * (no puede tumbar la carga de un estudio visible), y no abre nada por sí sola
 * — el pase sigue necesitando la firma HMAC. Tampoco sirve para adivinar la
 * clave: la sal del scrypt no sale de aquí.
 *
 * Cada `hashearClave` lleva sal nueva, así que volver a guardar la MISMA clave
 * también cambia la huella. Es lo esperable de «cambiar la clave».
 */
export function huellaClave(guardado: string | null | undefined): string | null {
  if (!guardado) return null;
  return createHash('sha256').update(guardado).digest('base64url').slice(0, 22);
}

export function firmarAcceso(
  studioId: string,
  huella: string,
  ahora: number = Date.now(),
  claveFirma: string = secreto(),
): string {
  const payloadB64 = Buffer.from(JSON.stringify({ tipo: TIPO, studioId, huella, exp: ahora + TTL_MS })).toString('base64url');
  return `${payloadB64}.${firmar(payloadB64, claveFirma)}`;
}

/**
 * ¿Este pase abre ESTE estudio, con SU clave de ahora, en este momento?
 *
 * Comprueba cada cosa por separado a propósito: firma (que no lo haya
 * fabricado cualquiera), `tipo` (que no sea un token de otra cosa firmado con
 * el mismo secreto), `studioId` (que no sea el de otro estudio) y `huella`
 * (que la clave con la que se entró siga siendo la guardada). Sin clave
 * guardada no abre ningún pase: un pase sin huella —los de antes de este
 * cambio— tampoco.
 */
export function verificarAcceso(
  token: string | null | undefined,
  studioId: string,
  huellaGuardada: string | null | undefined,
  ahora: number = Date.now(),
  claveFirma: string = secreto(),
): boolean {
  if (!token || !huellaGuardada) return false;
  const punto = token.indexOf('.');
  if (punto <= 0) return false;
  const payloadB64 = token.slice(0, punto);
  const sig = token.slice(punto + 1);

  const esperada = Buffer.from(firmar(payloadB64, claveFirma));
  const recibida = Buffer.from(sig);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return false;

  try {
    const data = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as {
      tipo?: unknown; studioId?: unknown; huella?: unknown; exp?: unknown;
    };
    if (data.tipo !== TIPO) return false;
    if (typeof data.exp !== 'number' || data.exp < ahora) return false;
    if (typeof data.huella !== 'string' || data.huella !== huellaGuardada) return false;
    return data.studioId === studioId;
  } catch {
    return false;
  }
}

// ── Quién la configura, y qué se contesta al leerla ─────────────────────────

/**
 * Solo la propietaria. Es el mismo listón que la RLS de `studios` (solo la
 * dueña modifica su fila), que `/configuracion` (cerrada a MANAGER en
 * `lib/permisos-reglas.ts`) y que publicar la marca (`/api/theme/publish`).
 * La ruta escribe con service-role, así que esta comprobación ES la cerradura.
 */
export function puedeCambiarVisibilidadPagina(rol: string | null | undefined): boolean {
  return rol === 'PROPIETARIO';
}

export type EstadoPaginaRespuesta =
  | { status: 200; body: { oculta: boolean; tieneClave: boolean } }
  | { status: 404 | 503; body: { error: string } };

/**
 * Traduce la lectura de `studios` a la respuesta del GET. ⚠️ Un error al leer
 * NO es «visible»: con `data` en null por un fallo, contestar `oculta: false`
 * haría que la pantalla enseñara como visible una página que quizá está
 * escondida. Sin leer, no se afirma nada.
 */
export function estadoPaginaDesdeLectura(lectura: {
  data: { pagina_publica_oculta?: boolean | null; pagina_publica_clave_hash?: string | null } | null;
  error: unknown;
}): EstadoPaginaRespuesta {
  if (lectura.error)
    return { status: 503, body: { error: 'No se ha podido leer la visibilidad de tu página. Vuelve a intentarlo.' } };
  if (!lectura.data)
    return { status: 404, body: { error: 'No se ha encontrado tu estudio. Recarga la página y vuelve a intentarlo.' } };
  return {
    status: 200,
    body: {
      oculta: lectura.data.pagina_publica_oculta === true,
      tieneClave: huellaClave(lectura.data.pagina_publica_clave_hash) !== null,
    },
  };
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
  /** `huellaClave()` de la clave guardada ahora mismo; `null` = sin clave. */
  huellaClave: string | null;
  pase: string | null | undefined;
  studioId: string;
  ahora?: number;
  claveFirma?: string;
}): VeredictoPagina {
  if (!opciones.oculta) return 'abierta';
  const { huellaClave: huella, pase, studioId, ahora, claveFirma } = opciones;
  // Sin clave no se mira ningún pase: «oculta sin clave» es «no entra nadie»,
  // tampoco quien entró antes. Y un pase de otra clave (cambiada) no abre:
  // decisión del equipo, cambiar o quitar la clave cierra a todo el mundo.
  if (!huella) return 'cerrada';
  if (verificarAcceso(pase, studioId, huella, ahora ?? Date.now(), claveFirma ?? secreto())) return 'abierta';
  return 'pide-clave';
}

// ── Las puertas que escriben ────────────────────────────────────────────────

/** Lo que se contesta a quien intenta reservar, comprar o darse de alta desde
 *  fuera con la página oculta. Sin jerga: lo lee alguien que no sabe qué es
 *  «ocultar la página». */
export const MENSAJE_NO_ACEPTA_RESERVAS = 'Este estudio está preparando su página y todavía no acepta reservas.';

export type PuertaPublica = 'abierta' | 'cerrada' | 'sin-leer';

/**
 * ¿Deja pasar esta puerta pública (reservar, comprar, alta…) a esta petición?
 *
 * Decisión del fundador (16-sep): con la página oculta NO se reserva desde
 * fuera. Antes «ocultar» solo escondía las pantallas y las rutas seguían
 * escribiendo. Es la MISMA regla que `veredictoPagina`, leída desde una ruta:
 * pasa quien entró con la clave vigente de ESE estudio, nadie más.
 *
 *  · `sin-leer`: la lectura falló. No se afirma que esté visible ni oculta; la
 *    ruta contesta lo que ya contesta ante un fallo de lectura.
 *  · Estudio que no existe → `abierta`: no hay nada oculto que guardar, y la
 *    propia ruta responde lo de siempre.
 *  · Sin secreto para comprobar el pase (entorno mal configurado) → `cerrada`:
 *    con la página oculta, no poder comprobar la llave no abre la puerta.
 */
export function puertaPublica(opciones: {
  lectura: {
    data: { pagina_publica_oculta?: boolean | null; pagina_publica_clave_hash?: string | null } | null;
    error: unknown;
  };
  pase: string | null | undefined;
  studioId: string;
  ahora?: number;
  claveFirma?: string;
}): PuertaPublica {
  const { lectura, pase, studioId, ahora, claveFirma } = opciones;
  if (lectura.error) return 'sin-leer';
  if (!lectura.data || lectura.data.pagina_publica_oculta !== true) return 'abierta';
  try {
    const veredicto = veredictoPagina({
      oculta: true,
      huellaClave: huellaClave(lectura.data.pagina_publica_clave_hash),
      pase, studioId, ahora, claveFirma,
    });
    return veredicto === 'abierta' ? 'abierta' : 'cerrada';
  } catch {
    return 'cerrada';
  }
}

/**
 * Lo que devuelve el catálogo público (`/api/public/studio-data`) con la página
 * oculta y sin pase: el nombre para pintar el aviso y nada más. Ni clases, ni
 * planes, ni los datos de la socia. 200 y no un error: quien lo pide no ha
 * fallado, y el calendario incrustado pinta el aviso con esto.
 */
export function catalogoPaginaOculta(nombre: string | null | undefined): { paginaOculta: true; nombre: string } {
  return { paginaOculta: true, nombre: nombre ?? '' };
}

/** La respuesta de una puerta que no deja pasar, o `null` si deja. */
export function respuestaPuertaPublica(puerta: PuertaPublica):
  | { status: 403; body: { error: string; codigo: 'PAGINA_OCULTA' } }
  | { status: 503; body: { error: string } }
  | null {
  if (puerta === 'cerrada') return { status: 403, body: { error: MENSAJE_NO_ACEPTA_RESERVAS, codigo: 'PAGINA_OCULTA' } };
  if (puerta === 'sin-leer') return { status: 503, body: { error: 'No se ha podido comprobar el estudio. Vuelve a intentarlo.' } };
  return null;
}

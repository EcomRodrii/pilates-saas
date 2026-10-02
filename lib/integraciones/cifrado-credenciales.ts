// ─────────────────────────────────────────────────────────────────────────────
// Cifrado de las credenciales de las integraciones (Gmail, Google Calendar,
// Zoom, Klaviyo) en `integracion_credenciales`.
//
// La tabla ya solo la lee `service_role`; esto es la segunda cerradura: que un
// volcado, una restauración o cualquiera con acceso SQL vea texto cifrado y no
// un token con el que mandar correo como el estudio. Por eso se cifra en la
// APP, con una clave que la base de datos no tiene (`INTEGRACIONES_CLAVE_CIFRADO`,
// 32 bytes en base64, solo en Vercel).
//
// Formato: `enc:v1:<kid>:<iv>:<cifrado+tag>` (base64url). `kid` son 8 hex del
// sha256 de la clave: dice con qué clave se cifró, para poder rotarla con
// `INTEGRACIONES_CLAVE_CIFRADO_ANTERIOR` sin reconectar nada. El contexto
// (estudio, proveedor y campo) va como dato autenticado: un valor cifrado
// copiado a otra fila no se descifra.
//
// Mientras no hay clave, o con filas de antes, conviven valores en claro: se
// leen tal cual y se cifran en cuanto hay clave (al guardar y en el barrido
// nocturno). Lo que NO se hace nunca es devolver un valor cifrado que no se
// pudo descifrar: eso es `ok: false`, y quien lo lee trata la integración como
// no conectada.
//
// Sin `server-only` a propósito: lo importan solo módulos de servidor, y así
// sus pruebas corren con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PREFIJO = 'enc:v1:';
const ALGORITMO = 'aes-256-gcm';
const BYTES_IV = 12;
const BYTES_TAG = 16;

export interface ClavesCredenciales {
  /** Con la que se cifra. `null`: aún no está puesta (o no mide 32 bytes). */
  actual: Buffer | null;
  /** La de antes de una rotación: solo para descifrar. */
  anterior: Buffer | null;
  /** Hay algo escrito en la variable, pero no es una clave válida. */
  malformada: boolean;
}

function leerClave(valor: string | undefined): { clave: Buffer | null; malformada: boolean } {
  const limpio = valor?.trim();
  if (!limpio) return { clave: null, malformada: false };
  const clave = Buffer.from(limpio, 'base64');
  return clave.length === 32 ? { clave, malformada: false } : { clave: null, malformada: true };
}

export function clavesDelEntorno(env: Record<string, string | undefined> = process.env): ClavesCredenciales {
  const actual = leerClave(env.INTEGRACIONES_CLAVE_CIFRADO);
  const anterior = leerClave(env.INTEGRACIONES_CLAVE_CIFRADO_ANTERIOR);
  return { actual: actual.clave, anterior: anterior.clave, malformada: actual.malformada || anterior.malformada };
}

export function idDeClave(clave: Buffer): string {
  return createHash('sha256').update(clave).digest('hex').slice(0, 8);
}

/** Lo que autentica el cifrado: el mismo token en otra fila o en otro campo no vale. */
export function contextoCredencial(studioId: string, proveedor: string, campo: 'access_token' | 'refresh_token'): string {
  return `${studioId}:${proveedor}:${campo}`;
}

export function estaCifrado(valor: string): boolean {
  return valor.startsWith(PREFIJO);
}

export function cifrarCredencial(valor: string, contexto: string, clave: Buffer): string {
  const iv = randomBytes(BYTES_IV);
  const cifrador = createCipheriv(ALGORITMO, clave, iv, { authTagLength: BYTES_TAG });
  cifrador.setAAD(Buffer.from(contexto, 'utf8'));
  const cuerpo = Buffer.concat([cifrador.update(valor, 'utf8'), cifrador.final(), cifrador.getAuthTag()]);
  return `${PREFIJO}${idDeClave(clave)}:${iv.toString('base64url')}:${cuerpo.toString('base64url')}`;
}

export type CredencialLeida =
  | { ok: true; valor: string; enClaro: boolean }
  | { ok: false; motivo: 'sin-clave' | 'clave-desconocida' | 'no-descifra' | 'formato' };

export function descifrarCredencial(valor: string, contexto: string, claves: ClavesCredenciales): CredencialLeida {
  if (!estaCifrado(valor)) return { ok: true, valor, enClaro: true };
  const partes = valor.slice(PREFIJO.length).split(':');
  if (partes.length !== 3) return { ok: false, motivo: 'formato' };
  const [kid, ivTexto, cuerpoTexto] = partes;
  const disponibles = [claves.actual, claves.anterior].filter((c): c is Buffer => c !== null);
  if (disponibles.length === 0) return { ok: false, motivo: 'sin-clave' };
  const clave = disponibles.find(c => idDeClave(c) === kid);
  if (!clave) return { ok: false, motivo: 'clave-desconocida' };
  const iv = Buffer.from(ivTexto, 'base64url');
  const cuerpo = Buffer.from(cuerpoTexto, 'base64url');
  if (iv.length !== BYTES_IV || cuerpo.length < BYTES_TAG) return { ok: false, motivo: 'formato' };
  try {
    const descifrador = createDecipheriv(ALGORITMO, clave, iv, { authTagLength: BYTES_TAG });
    descifrador.setAAD(Buffer.from(contexto, 'utf8'));
    descifrador.setAuthTag(cuerpo.subarray(cuerpo.length - BYTES_TAG));
    const claro = Buffer.concat([descifrador.update(cuerpo.subarray(0, cuerpo.length - BYTES_TAG)), descifrador.final()]);
    return { ok: true, valor: claro.toString('utf8'), enClaro: false };
  } catch {
    // Alterado, de otra fila o de otro campo: el tag de GCM no cuadra.
    return { ok: false, motivo: 'no-descifra' };
  }
}

/**
 * Lo que se escribe: cifrado si hay clave; si no, el valor tal cual con
 * `enClaro: true`. Desde el 2-oct-2026 quien guarda NO escribe un `enClaro`
 * (`sinClaveDeCifrado` en lib/db/supabase-data-admin.ts) y la BD lo rechaza
 * con un CHECK (migr 20261003020300): antes se guardaba en claro con un aviso,
 * para no desconectar a Klaviyo/Zoom al renovar sin clave.
 */
export function paraGuardar(valor: string, contexto: string, claves: ClavesCredenciales): { valor: string; enClaro: boolean } {
  if (!claves.actual) return { valor, enClaro: true };
  return { valor: cifrarCredencial(valor, contexto, claves.actual), enClaro: false };
}

/**
 * Si un valor ya guardado hay que (re)cifrarlo con la clave actual: está en
 * claro, o cifrado con la anterior. Sin clave actual, nada.
 */
export function pideCifrarse(valor: string, claves: ClavesCredenciales): boolean {
  if (!claves.actual) return false;
  if (!estaCifrado(valor)) return true;
  return valor.slice(PREFIJO.length).split(':')[0] !== idDeClave(claves.actual);
}

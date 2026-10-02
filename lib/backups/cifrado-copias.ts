// ─────────────────────────────────────────────────────────────────────────────
// Cifrado de las copias de seguridad que se guardan en Cloudflare R2.
//
// Una copia es el JSON de 44 tablas de un estudio (clientas, reservas, cobros,
// notas de progreso…). R2 ya cifra en disco, pero con SU clave: quien tenga
// acceso al bucket (un token de API filtrado, un error de permisos, el propio
// proveedor) lee el JSON. Por eso se cifra en la APP antes de subirla, con una
// clave que solo está en Vercel (`BACKUPS_CLAVE_CIFRADO`, 32 bytes en base64),
// igual que las credenciales de las integraciones
// (lib/integraciones/cifrado-credenciales.ts). Clave propia y no la de las
// integraciones: una filtración de una no abre la otra.
//
// Formato binario (una copia puede pesar megas; base64 la inflaría un 33 %):
//   «TNTRCP1\n» (8 bytes) · kid (8 hex ASCII) · iv (12) · cifrado · tag (16)
// `kid` = 8 hex del sha256 de la clave: dice con cuál se cifró, para rotar con
// `BACKUPS_CLAVE_CIFRADO_ANTERIOR` sin perder las copias viejas.
//
// El dato autenticado es la CLAVE DEL OBJETO (`backups/<estudio>/<id>.json`):
// una copia movida a la ruta de otro estudio no se descifra, así que una
// restauración nunca puede meter los datos de un estudio en otro.
//
// Las copias de antes (JSON en claro) se siguen leyendo: `esCopiaCifrada` las
// distingue por la cabecera, que un JSON nunca tiene.
//
// Sin `server-only` y sin `@/`: lo importan solo módulos de servidor (lib/r2.ts),
// y así sus pruebas corren con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const CABECERA = Buffer.from('TNTRCP1\n', 'ascii');
const BYTES_KID = 8;
const BYTES_IV = 12;
const BYTES_TAG = 16;
const ALGORITMO = 'aes-256-gcm';

export interface ClavesCopias {
  /** Con la que se cifra. `null`: no está puesta (o no mide 32 bytes). */
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

export function clavesCopiasDelEntorno(env: Record<string, string | undefined> = process.env): ClavesCopias {
  const actual = leerClave(env.BACKUPS_CLAVE_CIFRADO);
  const anterior = leerClave(env.BACKUPS_CLAVE_CIFRADO_ANTERIOR);
  return { actual: actual.clave, anterior: anterior.clave, malformada: actual.malformada || anterior.malformada };
}

export function idDeClaveCopia(clave: Buffer): string {
  return createHash('sha256').update(clave).digest('hex').slice(0, BYTES_KID);
}

export function esCopiaCifrada(bytes: Uint8Array): boolean {
  return bytes.length >= CABECERA.length && Buffer.from(bytes.subarray(0, CABECERA.length)).equals(CABECERA);
}

/** Cifra los bytes de una copia. `contexto` = la clave del objeto en R2. */
export function cifrarCopia(claro: Uint8Array, contexto: string, clave: Buffer): Uint8Array<ArrayBuffer> {
  const iv = randomBytes(BYTES_IV);
  const cifrador = createCipheriv(ALGORITMO, clave, iv, { authTagLength: BYTES_TAG });
  cifrador.setAAD(Buffer.from(contexto, 'utf8'));
  // Copia a un ArrayBuffer propio: es lo que `fetch` acepta como cuerpo.
  return new Uint8Array(Buffer.concat([
    CABECERA, Buffer.from(idDeClaveCopia(clave), 'ascii'), iv,
    cifrador.update(claro), cifrador.final(), cifrador.getAuthTag(),
  ]));
}

export class ErrorCopiaCifrada extends Error {
  readonly motivo: 'sin-clave' | 'clave-desconocida' | 'no-descifra' | 'formato';
  constructor(motivo: ErrorCopiaCifrada['motivo']) {
    super(`Copia cifrada ilegible: ${motivo}`);
    this.name = 'ErrorCopiaCifrada';
    this.motivo = motivo;
  }
}

/**
 * Bytes en claro de una copia. Si no está cifrada (copias anteriores), los
 * devuelve tal cual. Si lo está y no se puede descifrar, LANZA: restaurar a
 * medias o con basura es peor que no restaurar.
 */
export function descifrarCopia(bytes: Uint8Array, contexto: string, claves: ClavesCopias): Uint8Array {
  if (!esCopiaCifrada(bytes)) return bytes;
  const b = Buffer.from(bytes);
  const minimo = CABECERA.length + BYTES_KID + BYTES_IV + BYTES_TAG;
  if (b.length < minimo) throw new ErrorCopiaCifrada('formato');
  const kid = b.subarray(CABECERA.length, CABECERA.length + BYTES_KID).toString('ascii');
  const iv = b.subarray(CABECERA.length + BYTES_KID, CABECERA.length + BYTES_KID + BYTES_IV);
  const cuerpo = b.subarray(CABECERA.length + BYTES_KID + BYTES_IV, b.length - BYTES_TAG);
  const tag = b.subarray(b.length - BYTES_TAG);

  const disponibles = [claves.actual, claves.anterior].filter((c): c is Buffer => c !== null);
  if (disponibles.length === 0) throw new ErrorCopiaCifrada('sin-clave');
  const clave = disponibles.find(c => idDeClaveCopia(c) === kid);
  if (!clave) throw new ErrorCopiaCifrada('clave-desconocida');
  try {
    const descifrador = createDecipheriv(ALGORITMO, clave, iv, { authTagLength: BYTES_TAG });
    descifrador.setAAD(Buffer.from(contexto, 'utf8'));
    descifrador.setAuthTag(tag);
    return Buffer.concat([descifrador.update(cuerpo), descifrador.final()]);
  } catch {
    throw new ErrorCopiaCifrada('no-descifra');
  }
}

import { AwsClient } from 'aws4fetch';
import { createHash } from 'node:crypto';
import type { BackupSnapshot } from '@/lib/engines/backup-engine';
// Relativo con .ts explícito para que `backup-engine` (que importa este módulo)
// se pueda cargar desde `node --test`. Ver tentare-os.md.
import { fetchExterno, TIMEOUT_EXTERNO_MS, TIMEOUT_TRANSFERENCIA_MS } from './fetch-externo.ts';
import { rutaConTravesia } from './ruta-segura.ts';
import { cifrarCopia, clavesCopiasDelEntorno, descifrarCopia, esCopiaCifrada } from './backups/cifrado-copias.ts';

// Cloudflare R2 (S3-compatible) para guardar los snapshots de backup FUERA de
// Postgres (P0-13/14). Guardar el backup dentro de la misma BD que respalda es
// como dejar la llave de repuesto dentro de la caja fuerte: si el Postgres se
// corrompe o se pierde, el backup se va con él. R2 lo saca a almacenamiento
// de objetos, barato y aparte.
//
// Firmamos con aws4fetch (~7KB) en vez del SDK de AWS: cold-starts rápidos en
// serverless. Todo gated por env vars — sin ellas, el motor de backup cae al
// modo antiguo (snapshot inline en la tabla), así que nada se rompe hasta que
// R2 esté configurado.
//
// Ubicación (contrato de encargo, 2-oct-2026): las copias tienen que estar en
// un bucket con jurisdicción de la UE, que en R2 se elige AL CREARLO y no se
// cambia después, y que solo responde en su endpoint de jurisdicción
// (`<cuenta>.eu.r2.cloudflarestorage.com`). Por eso hay DOS variables:
//
//   · `R2_BUCKET_UE` (si está): el bucket de la UE, donde se escribe todo.
//   · `R2_BUCKET`: el de siempre. Con `R2_BUCKET_UE` puesto pasa a ser el
//     «viejo»: lo que aún no se ha movido se sigue LEYENDO de ahí, lo que la app
//     borra se borra también ahí (para que nada resucite), y la copia de cada
//     noche lo va trasladando al de la UE (`trasladarAlBucketUe`) hasta vaciarlo.
//     Mismo token para los dos (misma cuenta).
//
// Las copias van cifradas en la app (lib/backups/cifrado-copias.ts). Los
// ficheros de los temas importados no: son la web del estudio, no datos de
// personas, y se sirven tal cual.

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET?.trim() || undefined;
const R2_BUCKET_UE = process.env.R2_BUCKET_UE?.trim() || undefined;

export function r2Configurado(): boolean {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && (R2_BUCKET || R2_BUCKET_UE));
}

/**
 * Host S3 de R2. Con jurisdicción (`eu`), el de la jurisdicción: un bucket
 * creado en la UE no responde en el host general. Solo letras: el valor acaba
 * en un nombre de host.
 */
export function hostR2(cuenta: string, jurisdiccion: string | undefined): string {
  const j = jurisdiccion?.trim().toLowerCase();
  if (j && !/^[a-z]+$/.test(j)) throw new Error(`Jurisdicción de R2 no válida: ${jurisdiccion}`);
  return j ? `${cuenta}.${j}.r2.cloudflarestorage.com` : `${cuenta}.r2.cloudflarestorage.com`;
}

interface Bucket { base: string; ue: boolean }

/** Donde se escribe: el de la UE si está configurado; si no, el de siempre. */
function principal(): Bucket {
  return R2_BUCKET_UE
    ? { base: `https://${hostR2(R2_ACCOUNT_ID!, 'eu')}/${R2_BUCKET_UE}`, ue: true }
    : { base: `https://${hostR2(R2_ACCOUNT_ID!, undefined)}/${R2_BUCKET}`, ue: false };
}

/** El de siempre mientras se vacía hacia el de la UE; `null` si no hay traslado. */
function viejo(): Bucket | null {
  return R2_BUCKET_UE && R2_BUCKET && R2_BUCKET !== R2_BUCKET_UE
    ? { base: `https://${hostR2(R2_ACCOUNT_ID!, undefined)}/${R2_BUCKET}`, ue: false }
    : null;
}

/** ¿Queda un bucket viejo que vaciar? */
export function trasladoAUePendiente(): boolean {
  return r2Configurado() && viejo() !== null;
}

function client(): AwsClient {
  return new AwsClient({
    accessKeyId: R2_ACCESS_KEY_ID!,
    secretAccessKey: R2_SECRET_ACCESS_KEY!,
    service: 's3',
    region: 'auto', // R2 usa 'auto'
  });
}

// Clave del objeto para un backup. Namespaced por estudio para aislamiento y
// para poder purgar/listar por tenant.
export function claveBackup(studioId: string, backupId: string): string {
  return `backups/${studioId}/${backupId}.json`;
}

// ── Primitivas: un objeto en un bucket ──────────────────────────────────────

/**
 * PUT con el cuerpo de longitud conocida. R2 exige Content-Length; aws4fetch,
 * al hacer su propio fetch(), pasa un Request cuyo body SIEMPRE es un stream →
 * undici (runtime de Vercel) lo envía chunked → R2 responde 411. Así que
 * aws4fetch solo FIRMA y el fetch lo hacemos nosotros (Content-Length no va
 * firmado, añadirlo no rompe la firma). Timeout de transferencia, no de API:
 * sin él, un R2 degradado colgaría el cron hasta maxDuration.
 */
async function poner(b: Bucket, key: string, cuerpo: Uint8Array, contentType: string): Promise<void> {
  const url = `${b.base}/${key}`;
  // `Blob` porque algunas libs DOM de TS no aceptan un Uint8Array como BodyInit;
  // el cast, porque BlobPart exige un ArrayBuffer real (nunca llega uno compartido).
  const body = new Blob([cuerpo as Uint8Array<ArrayBuffer>]);
  const signed = await client().sign(url, { method: 'PUT', body, headers: { 'Content-Type': contentType } });
  const res = await fetchExterno(url, { method: 'PUT', body, headers: signed.headers }, TIMEOUT_TRANSFERENCIA_MS);
  if (!res.ok) throw new Error(`R2 PUT falló (${res.status}): ${await res.text().catch(() => '')}`);
}

/** El objeto, o `null` si no existe (404). Cualquier otro fallo lanza. */
async function traer(b: Bucket, key: string): Promise<{ bytes: Uint8Array; tipo: string } | null> {
  const res = await client().fetch(`${b.base}/${key}`, { method: 'GET', signal: AbortSignal.timeout(TIMEOUT_TRANSFERENCIA_MS) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 GET falló (${res.status}): ${await res.text().catch(() => '')}`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), tipo: res.headers.get('content-type') ?? 'application/octet-stream' };
}

/** Del principal; si no está y hay traslado pendiente, del viejo. */
async function leer(key: string): Promise<{ bytes: Uint8Array; tipo: string; deUe: boolean } | null> {
  const p = principal();
  const enPrincipal = await traer(p, key);
  if (enPrincipal) return { ...enPrincipal, deUe: p.ue };
  const v = viejo();
  const enViejo = v ? await traer(v, key) : null;
  return enViejo ? { ...enViejo, deUe: false } : null;
}

async function borrarEn(b: Bucket, key: string): Promise<void> {
  try {
    await client().fetch(`${b.base}/${key}`, { method: 'DELETE', signal: AbortSignal.timeout(TIMEOUT_EXTERNO_MS) });
  } catch {
    // best-effort
  }
}

/** Claves bajo un prefijo (una página de hasta 1.000; `null` si no se pudo listar). */
async function listar(b: Bucket, prefijo: string, max = 1000): Promise<string[] | null> {
  const url = `${b.base}?list-type=2&max-keys=${max}${prefijo ? `&prefix=${encodeURIComponent(prefijo)}` : ''}`;
  const res = await client().fetch(url, { method: 'GET', signal: AbortSignal.timeout(TIMEOUT_TRANSFERENCIA_MS) });
  if (!res.ok) return null;
  const xml = await res.text();
  return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
}

/** En los dos buckets mientras dure el traslado: lo borrado no puede volver a aparecer. */
function bucketsDondeBorrar(): Bucket[] {
  const v = viejo();
  return v ? [principal(), v] : [principal()];
}

// ── Copias de seguridad ─────────────────────────────────────────────────────

// Sube el snapshot a R2, cifrado. En PRODUCCIÓN, sin `BACKUPS_CLAVE_CIFRADO`
// no sube nada (lanza, y el cron lo avisa por estudio a Sentry): el contrato
// promete copias cifradas. Fuera de producción sube en claro y quien llama lo
// avisa. Una clave MAL escrita no es «sin clave»: lanza siempre.
export async function subirSnapshot(
  studioId: string, backupId: string, snapshot: BackupSnapshot,
): Promise<{ key: string; cifrada: boolean }> {
  const key = claveBackup(studioId, backupId);
  const claves = clavesCopiasDelEntorno();
  if (claves.malformada) throw new Error('BACKUPS_CLAVE_CIFRADO no es una clave de 32 bytes en base64');
  if (!claves.actual && process.env.VERCEL_ENV === 'production') {
    throw new Error('Copia no subida: falta BACKUPS_CLAVE_CIFRADO y en producción no se sube ninguna copia sin cifrar');
  }
  const claro = new TextEncoder().encode(JSON.stringify(snapshot));
  const body = claves.actual ? cifrarCopia(claro, key, claves.actual) : claro;
  await poner(principal(), key, body, claves.actual ? 'application/octet-stream' : 'application/json');
  return { key, cifrada: claves.actual !== null };
}

// Descarga el snapshot por su clave, lo descifra si viene cifrado (las copias
// de antes del 2-oct-2026 no lo están) y lo parsea.
export async function descargarSnapshot(key: string): Promise<BackupSnapshot> {
  const obj = await leer(key);
  if (!obj) throw new Error(`R2 GET falló (404): ${key}`);
  // En el bucket de la UE todo llega cifrado (lo nuevo y lo que traslada
  // `trasladarAlBucketUe`): una copia en claro ahí no es «de antes», es algo que
  // no debería estar, y no se restaura.
  if (obj.deUe && !esCopiaCifrada(obj.bytes)) throw new Error(`Copia sin cifrar en el bucket de la UE: ${key}`);
  const bytes = descifrarCopia(obj.bytes, key, clavesCopiasDelEntorno());
  return JSON.parse(new TextDecoder().decode(bytes)) as BackupSnapshot;
}

// Borra objetos por clave. Best-effort: un fallo al borrar en R2 no debe tumbar
// la poda (la fila de metadata ya se fue); se ignora individualmente.
export async function borrarSnapshots(keys: string[]): Promise<void> {
  const buckets = bucketsDondeBorrar();
  await Promise.all(keys.flatMap(key => buckets.map(b => borrarEn(b, key))));
}

// ── Objetos binarios genéricos (importador de temas ZIP) ────────────────────
//
// A diferencia de `subirSnapshot`/`descargarSnapshot` (JSON, un solo tipo),
// esto sube CUALQUIER byte con SU content-type: el HTML/CSS/JS/imágenes/
// fuentes de un tema importado, tal cual venían en el ZIP — el punto 5 del
// encargo de fidelidad es justo "no perder ni transformar el fichero
// original", así que este helper no toca los bytes, solo los mueve de sitio.

/** Sube un fichero binario a R2. */
export async function subirObjetoR2(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  // Este es el ÚNICO punto por el que pasan TODAS las subidas a R2 — la defensa
  // contra la travesía de ruta va aquí, no en cada llamante. Ver lib/ruta-segura.ts.
  if (rutaConTravesia(key)) {
    throw new Error(`Clave de R2 con travesía de ruta rechazada: ${key}`);
  }
  await poner(principal(), key, bytes, contentType);
}

/** Descarga un objeto binario de R2. `null` si no existe (404), para que el
 *  llamador decida si eso es "aún no subido" o un error real. */
export async function descargarObjetoR2(key: string): Promise<Uint8Array | null> {
  return (await leer(key))?.bytes ?? null;
}

/** Borra TODOS los objetos bajo un prefijo (un tema importado, las copias de un
 *  estudio). R2/S3 no tiene "borrar por prefijo" nativo sin listar antes; para
 *  ese volumen (decenas o cientos) listar+borrar es sobrado. Best-effort. */
export async function borrarPrefijoR2(prefix: string): Promise<void> {
  for (const b of bucketsDondeBorrar()) {
    const claves = await listar(b, prefix).catch(() => null);
    if (!claves) continue;
    await Promise.all(claves.map(key => borrarEn(b, key)));
  }
}

// ── Traslado del bucket viejo al de la UE ───────────────────────────────────

export type AccionTraslado = 'ya-estaba' | 'copiar' | 'cifrar-y-copiar';

/**
 * Qué hacer con un objeto del bucket viejo. Si ya está en el de la UE, manda el
 * de la UE (puede ser una edición posterior de un tema): no se pisa, solo se
 * borra el viejo. Una copia de seguridad en claro se cifra al pasar.
 */
export function accionTraslado(clave: string, o: { existeEnUe: boolean; cifrada: boolean }): AccionTraslado {
  if (o.existeEnUe) return 'ya-estaba';
  return clave.startsWith('backups/') && !o.cifrada ? 'cifrar-y-copiar' : 'copiar';
}

const huella = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/**
 * Mueve hasta `limite` objetos del bucket viejo al de la UE, sin pasar de
 * `hastaMs`: copia (cifrando las copias en claro), lo vuelve a leer del de la
 * UE, comprueba que el contenido en claro es idéntico y SOLO entonces lo borra
 * del viejo. Lo llama la copia de cada noche hasta que el viejo queda vacío.
 */
export async function trasladarAlBucketUe(o: { limite: number; hastaMs: number }): Promise<{
  trasladados: number; yaEstaban: number; fallos: string[]; quedan: boolean;
}> {
  const v = viejo();
  const r = { trasladados: 0, yaEstaban: 0, fallos: [] as string[], quedan: false };
  if (!v || !r2Configurado()) return r;
  const p = principal();
  const claves = await listar(v, '', o.limite);
  if (!claves) { r.fallos.push('no se pudo listar el bucket viejo'); r.quedan = true; return r; }
  const llaves = clavesCopiasDelEntorno();

  for (const clave of claves) {
    if (Date.now() > o.hastaMs) { r.quedan = true; break; }
    try {
      const enUe = await traer(p, clave);
      const origen = enUe ? null : await traer(v, clave);
      if (!enUe && !origen) continue; // ya no está en ningún sitio
      const accion = accionTraslado(clave, { existeEnUe: !!enUe, cifrada: !!origen && esCopiaCifrada(origen.bytes) });
      if (accion === 'ya-estaba') { await borrarEn(v, clave); r.yaEstaban++; continue; }

      const esCopia = clave.startsWith('backups/');
      if (accion === 'cifrar-y-copiar' && !llaves.actual) throw new Error('falta BACKUPS_CLAVE_CIFRADO');
      const subir = accion === 'cifrar-y-copiar' ? cifrarCopia(origen!.bytes, clave, llaves.actual!) : origen!.bytes;
      await poner(p, clave, subir, esCopia ? 'application/octet-stream' : origen!.tipo);

      // Comprobación antes de borrar: lo que hay en la UE, en claro, es lo mismo.
      const vuelta = await traer(p, clave);
      if (!vuelta) throw new Error('no aparece en el bucket de la UE tras subirlo');
      const claroOrigen = esCopia ? descifrarCopia(origen!.bytes, clave, llaves) : origen!.bytes;
      const claroVuelta = esCopia ? descifrarCopia(vuelta.bytes, clave, llaves) : vuelta.bytes;
      if (esCopia && !esCopiaCifrada(vuelta.bytes)) throw new Error('en la UE no está cifrada');
      if (huella(claroOrigen) !== huella(claroVuelta)) throw new Error('el contenido no coincide');

      await borrarEn(v, clave);
      r.trasladados++;
    } catch (e) {
      r.fallos.push(`${clave}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!r.quedan) r.quedan = claves.length >= o.limite || r.fallos.length > 0;
  return r;
}

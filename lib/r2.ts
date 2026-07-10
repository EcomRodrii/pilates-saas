import { AwsClient } from 'aws4fetch';
import type { BackupSnapshot } from '@/lib/backup-engine';

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

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;

export function r2Configurado(): boolean {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);
}

function endpointBase(): string {
  // Endpoint S3 de R2 por cuenta.
  return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`;
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

// Sube el snapshot como JSON a R2. Devuelve la clave guardada.
export async function subirSnapshot(studioId: string, backupId: string, snapshot: BackupSnapshot): Promise<string> {
  const key = claveBackup(studioId, backupId);
  // Body como Uint8Array (no string): R2 exige Content-Length en el PUT, y en
  // el runtime de Vercel un body string se envía sin él (chunked) → 411
  // MissingContentLength. Con longitud de bytes conocida, fetch pone el header
  // Content-Length solo. (En Node local el string sí lo ponía; solo fallaba en
  // producción — por eso hay que probar de verdad en prod.)
  const body = new TextEncoder().encode(JSON.stringify(snapshot));
  const res = await client().fetch(`${endpointBase()}/${key}`, {
    method: 'PUT',
    body,
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`R2 PUT falló (${res.status}): ${await res.text().catch(() => '')}`);
  }
  return key;
}

// Descarga y parsea el snapshot de R2 por su clave.
export async function descargarSnapshot(key: string): Promise<BackupSnapshot> {
  const res = await client().fetch(`${endpointBase()}/${key}`, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`R2 GET falló (${res.status}): ${await res.text().catch(() => '')}`);
  }
  return (await res.json()) as BackupSnapshot;
}

// Borra objetos de R2 por clave. Best-effort: un fallo al borrar en R2 no debe
// tumbar la poda (la fila de metadata ya se fue); se ignora individualmente.
export async function borrarSnapshots(keys: string[]): Promise<void> {
  const c = client();
  await Promise.all(
    keys.map(async key => {
      try {
        await c.fetch(`${endpointBase()}/${key}`, { method: 'DELETE' });
      } catch {
        // best-effort
      }
    })
  );
}

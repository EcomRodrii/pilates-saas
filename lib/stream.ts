// Cloudflare Stream para el hosting de los vídeos on-demand. Reutiliza la MISMA
// cuenta de Cloudflare que R2 (R2_ACCOUNT_ID) + un token de API con permiso de
// Stream. Igual que R2/Resend/Stripe: todo gated por env — sin el token, la
// subida degrada a "solo metadatos" (comportamiento antiguo) y nada se rompe.
//
// Env:
//   R2_ACCOUNT_ID            (ya existente — id de cuenta Cloudflare, compartido)
//   CLOUDFLARE_STREAM_TOKEN  token de API con permiso Stream:Edit
//
// El navegador NO ve el token: pide una "direct upload URL" de un solo uso a
// /api/ondemand/upload-url (servidor) y sube el fichero directo a Cloudflare.

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const STREAM_TOKEN = process.env.CLOUDFLARE_STREAM_TOKEN;

export function streamConfigurado(): boolean {
  return !!(ACCOUNT_ID && STREAM_TOKEN && !STREAM_TOKEN.includes('XXXX'));
}

export interface SubidaDirecta {
  uid: string;        // id del asset en Stream (se guarda en videos_on_demand.stream_uid)
  uploadURL: string;  // URL de un solo uso a la que el navegador POSTea el fichero
}

/**
 * Crea una subida directa en Cloudflare Stream. Devuelve el `uid` del futuro
 * vídeo y la `uploadURL` a la que el cliente sube el fichero. `maxDurationSeconds`
 * acota la duración aceptada (evita subidas gigantes por error).
 */
export async function crearSubidaDirecta(opts: { nombre: string; maxDurationSeconds?: number }): Promise<{ ok: true; data: SubidaDirecta } | { ok: false; error: string }> {
  if (!streamConfigurado()) return { ok: false, error: 'Cloudflare Stream no configurado' };
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream/direct_upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${STREAM_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxDurationSeconds: opts.maxDurationSeconds ?? 3600, meta: { name: opts.nombre.slice(0, 120) } }),
    });
    const json = (await res.json().catch(() => null)) as
      | { success: boolean; result?: { uid: string; uploadURL: string }; errors?: { message: string }[] }
      | null;
    if (!res.ok || !json?.success || !json.result) {
      return { ok: false, error: json?.errors?.[0]?.message ?? `Cloudflare Stream ${res.status}` };
    }
    return { ok: true, data: { uid: json.result.uid, uploadURL: json.result.uploadURL } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de red con Cloudflare Stream' };
  }
}

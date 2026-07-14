// Zoom — Server-to-Server OAuth (integración de plataforma).
// ENV del operador: ZOOM_ACCOUNT_ID + ZOOM_CLIENT_ID + ZOOM_CLIENT_SECRET.
// Nota: asociar reuniones a clases online concretas es un paso posterior; aquí
// queda el cliente listo (crear reunión) y la comprobación de credenciales.

const ACCOUNT_ID = process.env.ZOOM_ACCOUNT_ID;
const CLIENT_ID = process.env.ZOOM_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET;

export function isZoomConfigurado(): boolean {
  return !!(ACCOUNT_ID && CLIENT_ID && CLIENT_SECRET);
}

async function getAccessToken(): Promise<string | null> {
  if (!isZoomConfigurado()) return null;
  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ACCOUNT_ID}`,
    { method: 'POST', headers: { Authorization: `Basic ${auth}` } },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

/** Crea una reunión de Zoom para el usuario `me`; devuelve el enlace de acceso. */
export async function crearReunionZoom(
  tema: string,
  inicioISO: string,
  duracionMin: number,
): Promise<{ ok: true; joinUrl: string; id: number } | { ok: false; error: string }> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: 'Zoom no configurado o credenciales inválidas' };
  const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: tema.slice(0, 200), type: 2, start_time: inicioISO, duration: duracionMin, timezone: 'Europe/Madrid' }),
  });
  const data = (await res.json().catch(() => null)) as { id?: number; join_url?: string; message?: string } | null;
  if (!res.ok || !data?.join_url) return { ok: false, error: data?.message ?? `Zoom API ${res.status}` };
  return { ok: true, joinUrl: data.join_url, id: data.id ?? 0 };
}

export async function probarZoom(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isZoomConfigurado()) return { ok: false, error: 'Faltan ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET' };
  const token = await getAccessToken();
  return token ? { ok: true } : { ok: false, error: 'Credenciales de Zoom inválidas' };
}

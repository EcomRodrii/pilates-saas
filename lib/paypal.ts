// PayPal — REST API (integración de plataforma).
// ENV del operador: PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET (+ PAYPAL_ENV live|sandbox).
// Nota: el cableado como método de pago en el checkout de socias es un paso
// posterior; aquí queda el cliente listo (crear/capturar orden) y la comprobación.

const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const BASE = process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

export function isPayPalConfigurado(): boolean {
  return !!(CLIENT_ID && CLIENT_SECRET);
}

async function getAccessToken(): Promise<string | null> {
  if (!isPayPalConfigurado()) return null;
  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

/** Crea una orden de pago; devuelve el id y el enlace de aprobación. */
export async function crearOrdenPayPal(
  importe: number,
  concepto: string,
): Promise<{ ok: true; id: string; approveUrl: string | null } | { ok: false; error: string }> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: 'PayPal no configurado o credenciales inválidas' };
  const res = await fetch(`${BASE}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{ amount: { currency_code: 'EUR', value: importe.toFixed(2) }, description: concepto.slice(0, 127) }],
    }),
  });
  const data = (await res.json().catch(() => null)) as { id?: string; links?: { rel: string; href: string }[]; message?: string } | null;
  if (!res.ok || !data?.id) return { ok: false, error: data?.message ?? `PayPal API ${res.status}` };
  return { ok: true, id: data.id, approveUrl: data.links?.find((l) => l.rel === 'approve')?.href ?? null };
}

/** Captura una orden ya aprobada por el pagador. */
export async function capturarOrdenPayPal(orderId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: 'PayPal no configurado' };
  const res = await fetch(`${BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, error: data?.message ?? `PayPal API ${res.status}` };
  }
  return { ok: true };
}

export async function probarPayPal(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isPayPalConfigurado()) return { ok: false, error: 'Faltan PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET' };
  const token = await getAccessToken();
  return token ? { ok: true } : { ok: false, error: 'Credenciales de PayPal inválidas' };
}

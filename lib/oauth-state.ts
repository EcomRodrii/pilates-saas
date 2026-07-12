import { createHmac, timingSafeEqual } from 'crypto';

// C-8: `state` firmado para los flujos OAuth (Stripe Connect y Google Calendar).
//
// Antes el `state` era el studioId EN CLARO: los callbacks (GET no autenticado)
// se fiaban de él y vinculaban la cuenta de pagos / calendario a ESE estudio.
// Como los studioId son enumerables, cualquiera podía completar el flujo con
// state=<estudio_víctima> y conectar SU cuenta a la víctima (CSRF de binding →
// desvío de fondos en el caso de Stripe).
//
// Ahora el `state` es `payload.hmac`, donde payload = base64url({studioId,
// provider, exp}) firmado con OAUTH_STATE_SECRET. Lo EMITE una ruta de servidor
// autenticada (solo el PROPIETARIO de su propio estudio) y el callback lo
// VERIFICA (firma + expiración + proveedor). Stateless: no requiere tabla; la
// expiración corta (10 min) acota la ventana. `ahora` se inyecta para poder
// testear el helper de forma determinista.

const TTL_MS = 10 * 60 * 1000;

type Provider = 'stripe' | 'google';

function secret(): string {
  const s = process.env.OAUTH_STATE_SECRET;
  if (!s) throw new Error('OAUTH_STATE_SECRET no configurada');
  return s;
}

function firmar(payloadB64: string): string {
  return createHmac('sha256', secret()).update(payloadB64).digest('base64url');
}

export function firmarEstadoOAuth(studioId: string, provider: Provider, ahora: number): string {
  const payloadB64 = Buffer.from(JSON.stringify({ studioId, provider, exp: ahora + TTL_MS })).toString('base64url');
  return `${payloadB64}.${firmar(payloadB64)}`;
}

export function verificarEstadoOAuth(
  state: string | null | undefined,
  provider: Provider,
  ahora: number,
): { studioId: string } | null {
  if (!state) return null;
  const punto = state.indexOf('.');
  if (punto <= 0) return null;
  const payloadB64 = state.slice(0, punto);
  const sig = state.slice(punto + 1);

  // Comparación en tiempo constante de la firma.
  const esperada = Buffer.from(firmar(payloadB64));
  const recibida = Buffer.from(sig);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;

  try {
    const data = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as {
      studioId?: unknown; provider?: unknown; exp?: unknown;
    };
    if (data.provider !== provider) return null;
    if (typeof data.exp !== 'number' || data.exp < ahora) return null;
    if (typeof data.studioId !== 'string' || data.studioId.length === 0) return null;
    return { studioId: data.studioId };
  } catch {
    return null;
  }
}

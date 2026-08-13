import { createHmac, timingSafeEqual } from 'crypto';

// Enlace de baja de marketing firmado, SIN expiración a propósito — a
// diferencia de lib/oauth-state.ts (10 min, pensado para un flujo de
// autorización en curso), un enlace de baja va dentro de un email que puede
// quedarse sin abrir semanas: LSSI/RGPD exigen que la baja siga funcionando
// siempre, no solo mientras esté "reciente". Reutiliza OAUTH_STATE_SECRET
// (mismo modelo de amenaza: HMAC sobre un identificador, sin necesidad de
// tabla) en vez de pedir una env var nueva solo para esto.

function secret(): string {
  const s = process.env.OAUTH_STATE_SECRET;
  if (!s) throw new Error('OAUTH_STATE_SECRET no configurada');
  return s;
}

function firmar(payloadB64: string): string {
  return createHmac('sha256', secret()).update(payloadB64).digest('base64url');
}

export function firmarBajaMarketing(studioId: string, socioId: string): string {
  const payloadB64 = Buffer.from(JSON.stringify({ studioId, socioId })).toString('base64url');
  return `${payloadB64}.${firmar(payloadB64)}`;
}

export function verificarBajaMarketing(token: string | null | undefined): { studioId: string; socioId: string } | null {
  if (!token) return null;
  const punto = token.indexOf('.');
  if (punto <= 0) return null;
  const payloadB64 = token.slice(0, punto);
  const sig = token.slice(punto + 1);

  const esperada = Buffer.from(firmar(payloadB64));
  const recibida = Buffer.from(sig);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;

  try {
    const data = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as { studioId?: unknown; socioId?: unknown };
    if (typeof data.studioId !== 'string' || data.studioId.length === 0) return null;
    if (typeof data.socioId !== 'string' || data.socioId.length === 0) return null;
    return { studioId: data.studioId, socioId: data.socioId };
  } catch {
    return null;
  }
}

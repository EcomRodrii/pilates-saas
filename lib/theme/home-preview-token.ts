import { createHmac, timingSafeEqual } from 'crypto';

// Token firmado para /portal-preview/[slug] (Fase 4 del editor de temas):
// esa ruta no puede exigir sesión de socia (es el panel de staff quien la
// abre, dentro de un iframe) ni puede leer el `Authorization: Bearer` de
// verificarSesionStaff (un <iframe src> no lo manda). Mismo mecanismo que
// lib/sustituciones/token.ts para el mismo tipo de problema — HMAC
// stateless, TTL corto, comparación en tiempo constante.
//
// TTL corto (20 min, no 30 días como los enlaces de sustituciones): esto no
// es un enlace que alguien guarda, es un token de sesión de edición — el
// editor pide uno nuevo cada vez que monta el preview.

const TTL_MS = 20 * 60 * 1000;

function secret(): string {
  const s = process.env.HOME_PREVIEW_TOKEN_SECRET || process.env.OAUTH_STATE_SECRET;
  if (!s) throw new Error('Falta HOME_PREVIEW_TOKEN_SECRET (u OAUTH_STATE_SECRET) para firmar la vista previa del Inicio');
  return s;
}

function firmar(payloadB64: string): string {
  return createHmac('sha256', secret()).update(payloadB64).digest('base64url');
}

export function firmarTokenPreviewHome(studioId: string, ahora: number = Date.now()): string {
  const payloadB64 = Buffer.from(JSON.stringify({ studioId, exp: ahora + TTL_MS })).toString('base64url');
  return `${payloadB64}.${firmar(payloadB64)}`;
}

export function verificarTokenPreviewHome(
  token: string | null | undefined,
  ahora: number = Date.now(),
): { studioId: string } | null {
  if (!token) return null;
  const punto = token.indexOf('.');
  if (punto <= 0) return null;
  const payloadB64 = token.slice(0, punto);
  const sig = token.slice(punto + 1);

  const esperada = Buffer.from(firmar(payloadB64));
  const recibida = Buffer.from(sig);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;

  try {
    const data = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as {
      studioId?: unknown; exp?: unknown;
    };
    if (typeof data.exp !== 'number' || data.exp < ahora) return null;
    if (typeof data.studioId !== 'string' || data.studioId.length === 0) return null;
    return { studioId: data.studioId };
  } catch {
    return null;
  }
}

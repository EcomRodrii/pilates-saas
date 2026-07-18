import { createHmac, timingSafeEqual } from 'crypto';

// Deep link firmado para acciones de instructora SIN cuenta ni login (spec §3.1
// del doc de arquitectura). Misma mecánica que lib/oauth-state.ts (payload.hmac,
// stateless, comparación en tiempo constante), pero con payload propio ligado a
// una instructora concreta y a un scope.
//
// La validación de las entrevistas manda: la instructora abre el enlace y en 5
// segundos marca su disponibilidad. Nada de app + login + formulario. El token
// ES la autorización: firmado, no adivinable ni manipulable.
//
// Secreto: SUSTITUCION_TOKEN_SECRET si existe; si no, reutiliza OAUTH_STATE_SECRET
// (ya configurado en prod) para no bloquear el MVP en una env var nueva.
// `ahora` se inyecta para poder testear de forma determinista.

const TTL_DISPONIBILIDAD_MS = 30 * 24 * 60 * 60 * 1000; // 30 días: onboarding sin prisa

export type ScopeToken = 'disponibilidad';

function secret(): string {
  const s = process.env.SUSTITUCION_TOKEN_SECRET || process.env.OAUTH_STATE_SECRET;
  if (!s) throw new Error('Falta SUSTITUCION_TOKEN_SECRET (u OAUTH_STATE_SECRET) para firmar el deep link');
  return s;
}

function firmar(payloadB64: string): string {
  return createHmac('sha256', secret()).update(payloadB64).digest('base64url');
}

export function firmarTokenInstructora(
  instructorId: string,
  studioId: string,
  scope: ScopeToken,
  ahora: number = Date.now(),
): string {
  const payloadB64 = Buffer.from(
    JSON.stringify({ instructorId, studioId, scope, exp: ahora + TTL_DISPONIBILIDAD_MS }),
  ).toString('base64url');
  return `${payloadB64}.${firmar(payloadB64)}`;
}

export function verificarTokenInstructora(
  token: string | null | undefined,
  scope: ScopeToken,
  ahora: number = Date.now(),
): { instructorId: string; studioId: string } | null {
  if (!token) return null;
  const punto = token.indexOf('.');
  if (punto <= 0) return null;
  const payloadB64 = token.slice(0, punto);
  const sig = token.slice(punto + 1);

  // Comparación en tiempo constante de la firma.
  const esperada = Buffer.from(firmar(payloadB64));
  const recibida = Buffer.from(sig);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;

  try {
    const data = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as {
      instructorId?: unknown; studioId?: unknown; scope?: unknown; exp?: unknown;
    };
    if (data.scope !== scope) return null;
    if (typeof data.exp !== 'number' || data.exp < ahora) return null;
    if (typeof data.instructorId !== 'string' || data.instructorId.length === 0) return null;
    if (typeof data.studioId !== 'string' || data.studioId.length === 0) return null;
    return { instructorId: data.instructorId, studioId: data.studioId };
  } catch {
    return null;
  }
}

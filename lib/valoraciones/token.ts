import { createHmac, timingSafeEqual } from 'crypto';

// Deep link firmado para que una ALUMNA valore una clase SIN login. Misma mecánica
// HMAC que lib/sustituciones/token.ts (payload.hmac, stateless, comparación en
// tiempo constante), pero ligado a (socio, sesión): el token ES la autorización.
//
// La instructora valorada se resuelve en el servidor desde sesiones.instructor_id
// (quien REALMENTE dio la clase, incluida una sustituta) — no se guarda en el token.
//
// Secreto: SUSTITUCION_TOKEN_SECRET si existe; si no, OAUTH_STATE_SECRET (ya en
// prod). `ahora` se inyecta para testear de forma determinista.

const TTL_VALORAR_MS = 14 * 24 * 60 * 60 * 1000; // 14 días para valorar tras la clase

function secret(): string {
  const s = process.env.SUSTITUCION_TOKEN_SECRET || process.env.OAUTH_STATE_SECRET;
  if (!s) throw new Error('Falta SUSTITUCION_TOKEN_SECRET (u OAUTH_STATE_SECRET) para firmar el deep link');
  return s;
}

function firmar(payloadB64: string): string {
  return createHmac('sha256', secret()).update(payloadB64).digest('base64url');
}

export function firmarTokenValoracion(
  studioId: string,
  socioId: string,
  sesionId: string,
  ahora: number = Date.now(),
): string {
  const payloadB64 = Buffer.from(
    JSON.stringify({ studioId, socioId, sesionId, scope: 'valorar', exp: ahora + TTL_VALORAR_MS }),
  ).toString('base64url');
  return `${payloadB64}.${firmar(payloadB64)}`;
}

export function verificarTokenValoracion(
  token: string | null | undefined,
  ahora: number = Date.now(),
): { studioId: string; socioId: string; sesionId: string } | null {
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
      studioId?: unknown; socioId?: unknown; sesionId?: unknown; scope?: unknown; exp?: unknown;
    };
    if (data.scope !== 'valorar') return null;
    if (typeof data.exp !== 'number' || data.exp < ahora) return null;
    if (typeof data.studioId !== 'string' || data.studioId.length === 0) return null;
    if (typeof data.socioId !== 'string' || data.socioId.length === 0) return null;
    if (typeof data.sesionId !== 'string' || data.sesionId.length === 0) return null;
    return { studioId: data.studioId, socioId: data.socioId, sesionId: data.sesionId };
  } catch {
    return null;
  }
}

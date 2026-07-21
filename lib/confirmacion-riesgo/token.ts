import { createHmac, timingSafeEqual } from 'crypto';

// Deep link firmado para que una socia de riesgo confirme SIN login que viene a
// su clase. Misma mecánica HMAC que lib/valoraciones/token.ts y
// lib/sustituciones/token.ts (payload.hmac, stateless, comparación en tiempo
// constante): el token ES la autorización, ligado a (estudio, socia, reserva).
//
// Sin registro de revocación (a diferencia de los enlaces de instructora,
// PR #201): este token es de un solo propósito y vida corta, y no hay ningún
// botón de "regenerar" para él — no hace falta ese mecanismo.
//
// Secreto: SUSTITUCION_TOKEN_SECRET si existe; si no, OAUTH_STATE_SECRET (ya en
// prod). `ahora` se inyecta para testear de forma determinista.

// Cubre de sobra la ventana de aviso (20-30h antes) + el margen hasta el corte
// (3h antes): un token firmado nada más pedirse la confirmación sigue siendo
// válido en todo momento hasta bien pasado el corte.
const TTL_CONFIRMAR_MS = 36 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.SUSTITUCION_TOKEN_SECRET || process.env.OAUTH_STATE_SECRET;
  if (!s) throw new Error('Falta SUSTITUCION_TOKEN_SECRET (u OAUTH_STATE_SECRET) para firmar el deep link');
  return s;
}

function firmar(payloadB64: string): string {
  return createHmac('sha256', secret()).update(payloadB64).digest('base64url');
}

export function firmarTokenConfirmacion(
  studioId: string,
  socioId: string,
  reservaId: string,
  ahora: number = Date.now(),
): string {
  const payloadB64 = Buffer.from(
    JSON.stringify({ studioId, socioId, reservaId, scope: 'confirmar_reserva', exp: ahora + TTL_CONFIRMAR_MS }),
  ).toString('base64url');
  return `${payloadB64}.${firmar(payloadB64)}`;
}

export function verificarTokenConfirmacion(
  token: string | null | undefined,
  ahora: number = Date.now(),
): { studioId: string; socioId: string; reservaId: string } | null {
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
      studioId?: unknown; socioId?: unknown; reservaId?: unknown; scope?: unknown; exp?: unknown;
    };
    if (data.scope !== 'confirmar_reserva') return null;
    if (typeof data.exp !== 'number' || data.exp < ahora) return null;
    if (typeof data.studioId !== 'string' || data.studioId.length === 0) return null;
    if (typeof data.socioId !== 'string' || data.socioId.length === 0) return null;
    if (typeof data.reservaId !== 'string' || data.reservaId.length === 0) return null;
    return { studioId: data.studioId, socioId: data.socioId, reservaId: data.reservaId };
  } catch {
    return null;
  }
}

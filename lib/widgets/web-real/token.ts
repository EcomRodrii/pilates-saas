import { createHmac, timingSafeEqual } from 'node:crypto';

// El permiso de UNA vez para enseñar la web de un estudio en la vista previa.
//
// La pantalla pide a /api/estudio/vista-previa-web («¿se puede enseñar mi web?»),
// que responde con sesión de la propietaria. Si se puede, entrega este token, y el
// marco (/vista-previa-web) lo exige: un <iframe src> no puede mandar el
// `Authorization: Bearer` de `verificarSesionStaff`, así que el permiso viaja
// firmado. Mismo mecanismo y mismo motivo que `lib/theme/home-preview-token.ts`:
// HMAC sin estado, TTL corto, comparación en tiempo constante.
//
// Lleva el estudio y el ORIGEN que salió de la base de datos; nunca una URL que
// haya escrito el navegador. El marco además vuelve a mirar que ese origen siga
// entre los autorizados del estudio.

const TTL_MS = 10 * 60 * 1000;

function secreto(): string {
  const s = process.env.HOME_PREVIEW_TOKEN_SECRET || process.env.OAUTH_STATE_SECRET;
  if (!s) throw new Error('Falta HOME_PREVIEW_TOKEN_SECRET (u OAUTH_STATE_SECRET) para firmar la vista previa de la web');
  return s;
}

function firmar(payloadB64: string): string {
  return createHmac('sha256', secreto()).update(`web-real.${payloadB64}`).digest('base64url');
}

export interface PermisoWebReal {
  studioId: string;
  /** `https://host` tal como está autorizado. */
  origen: string;
}

export function firmarPermisoWebReal(p: PermisoWebReal, ahora: number = Date.now()): string {
  const payloadB64 = Buffer.from(JSON.stringify({ s: p.studioId, o: p.origen, exp: ahora + TTL_MS })).toString('base64url');
  return `${payloadB64}.${firmar(payloadB64)}`;
}

export function verificarPermisoWebReal(token: string | null | undefined, ahora: number = Date.now()): PermisoWebReal | null {
  if (!token || token.length > 2000) return null;
  const punto = token.indexOf('.');
  if (punto <= 0) return null;
  const payloadB64 = token.slice(0, punto);
  const esperada = Buffer.from(firmar(payloadB64));
  const recibida = Buffer.from(token.slice(punto + 1));
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    const d = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as { s?: unknown; o?: unknown; exp?: unknown };
    if (typeof d.exp !== 'number' || d.exp < ahora) return null;
    if (typeof d.s !== 'string' || !d.s || typeof d.o !== 'string' || !d.o) return null;
    return { studioId: d.s, origen: d.o };
  } catch {
    return null;
  }
}

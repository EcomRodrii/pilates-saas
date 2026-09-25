// ─────────────────────────────────────────────────────────────────────────────
// Enlaces firmados del correo de descarga (lib/recursos/descargas.ts).
//
// Tres alcances, cada uno con su enlace:
//   · `descarga`  → el archivo. Caduca a los 30 días. No es un candado (el
//                    archivo es público, ver lib/recursos/descargas.ts) ni una
//                    prueba de nada: los antivirus de correo también lo abren.
//   · `novedades` → confirmar que quiere recibir novedades (doble confirmación
//                    del consentimiento), atado a UNA solicitud concreta
//                    (`solicitudId`): confirma esa, no «la última que haya», que
//                    pudo crear otra persona. Caduca a los 30 días.
//   · `baja`      → dejar de recibirlas. No caduca en la práctica (10 años): un
//                    enlace de baja que deja de funcionar incumple la LSSI.
//
// Mismo esquema que lib/valoraciones/token.ts: HMAC-SHA256 sobre el payload en
// base64url, con el mismo secreto. Para que un token de otro sitio del producto,
// firmado con esa misma clave, no sirva aquí (ni al revés), lo que se firma
// lleva delante el prefijo `descargas.` —como hace lib/pase-acceso.ts— y el
// payload, además, `v: 'descargas'`.
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from 'node:crypto';

export type AlcanceDescarga = 'descarga' | 'novedades' | 'baja';

const DIA_MS = 24 * 60 * 60 * 1000;
const TTL_MS: Record<AlcanceDescarga, number> = {
  descarga: 30 * DIA_MS,
  novedades: 30 * DIA_MS,
  baja: 3650 * DIA_MS,
};

export interface DatosTokenDescarga {
  alcance: AlcanceDescarga;
  leadId: string;
  /** Solo en `descarga`: qué archivo abre. */
  recurso?: string;
  /** Solo en `novedades`: la solicitud (evento SOLICITUD) que confirma. */
  solicitudId?: string;
}

function secretoPorDefecto(): string {
  const s = process.env.SUSTITUCION_TOKEN_SECRET || process.env.OAUTH_STATE_SECRET;
  if (!s) throw new Error('Falta SUSTITUCION_TOKEN_SECRET (o OAUTH_STATE_SECRET) para firmar los enlaces de descarga');
  return s;
}

function firma(payloadB64: string, secreto: string): string {
  return createHmac('sha256', secreto).update(`descargas.${payloadB64}`).digest('base64url');
}

export function firmarTokenDescarga(
  datos: DatosTokenDescarga,
  opciones: { ahora?: number; secreto?: string } = {},
): string {
  const ahora = opciones.ahora ?? Date.now();
  const payload = Buffer.from(JSON.stringify({
    v: 'descargas',
    a: datos.alcance,
    l: datos.leadId,
    ...(datos.recurso ? { r: datos.recurso } : {}),
    ...(datos.solicitudId ? { s: datos.solicitudId } : {}),
    exp: ahora + TTL_MS[datos.alcance],
  })).toString('base64url');
  return `${payload}.${firma(payload, opciones.secreto ?? secretoPorDefecto())}`;
}

/** `null` si está manipulado, caducado o no es de aquí. Nunca lanza por el token. */
export function verificarTokenDescarga(
  token: string,
  opciones: { ahora?: number; secreto?: string } = {},
): DatosTokenDescarga | null {
  if (typeof token !== 'string' || token.length > 2000) return null;
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  const [payloadB64, firmaRecibida] = partes;
  const esperada = Buffer.from(firma(payloadB64, opciones.secreto ?? secretoPorDefecto()));
  const recibida = Buffer.from(firmaRecibida);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    const d = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as Record<string, unknown>;
    if (d.v !== 'descargas') return null;
    if (d.a !== 'descarga' && d.a !== 'novedades' && d.a !== 'baja') return null;
    if (typeof d.l !== 'string' || !d.l) return null;
    if (typeof d.exp !== 'number' || d.exp < (opciones.ahora ?? Date.now())) return null;
    if (d.a === 'descarga' && typeof d.r !== 'string') return null;
    if (d.a === 'novedades' && (typeof d.s !== 'string' || !d.s)) return null;
    return {
      alcance: d.a,
      leadId: d.l,
      ...(typeof d.r === 'string' ? { recurso: d.r } : {}),
      ...(typeof d.s === 'string' ? { solicitudId: d.s } : {}),
    };
  } catch {
    return null;
  }
}

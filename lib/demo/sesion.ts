// La sesión de demo: un token firmado, sin estado en servidor.
//
// Por qué sin tabla: la demo no guarda nada que no se pueda recalcular (una
// demo es una función de `escenario + parámetros`) y lo único con identidad, el
// lead, ya vive en `plataforma_lead`. Un token firmado da lo que hace falta:
//   · IDOR: quien no tiene un token que firmamos nosotros no puede hablar con
//     Tenti ni evaluar nada, y un token no sirve para otra sesión (lleva su id).
//   · Expiración: caduca solo (24 h).
//   · Aislamiento: el prefijo firmado (`demo-sesion.`) hace que un token de
//     otro sitio del producto, firmado con la misma clave, no valga aquí
//     (mismo esquema que descargas-token.ts).
// Los topes (turnos por sesión) NO van aquí: un token no puede contar, los
// cuenta `rate_limit_hit` en la base de datos, clave por `sid`.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { esTipoCentro, type TipoCentro } from './centros.ts';

const DIA_MS = 24 * 60 * 60 * 1000;
export const TTL_MS = DIA_MS;

export interface DatosSesionDemo {
  /** Identificador de ESTA sesión (clave de los topes). */
  sid: string;
  /** El lead en `plataforma_lead`. */
  leadId: string;
  /** ¿Lo creó esta sesión? Solo entonces la demo puede escribirle (nunca a un lead preexistente: el correo no está verificado). */
  nuevo: boolean;
  tipoCentro: TipoCentro;
}

function secretoPorDefecto(): string {
  const s = process.env.SUSTITUCION_TOKEN_SECRET || process.env.OAUTH_STATE_SECRET;
  if (!s) throw new Error('Falta SUSTITUCION_TOKEN_SECRET (o OAUTH_STATE_SECRET) para firmar la sesión de la demo');
  return s;
}

function firma(payloadB64: string, secreto: string): string {
  return createHmac('sha256', secreto).update(`demo-sesion.${payloadB64}`).digest('base64url');
}

export function nuevoSid(): string {
  return randomBytes(12).toString('base64url');
}

export function firmarSesionDemo(
  datos: DatosSesionDemo,
  opciones: { ahora?: number; secreto?: string } = {},
): string {
  const ahora = opciones.ahora ?? Date.now();
  const payload = Buffer.from(JSON.stringify({
    v: 'demo', s: datos.sid, l: datos.leadId, n: datos.nuevo, t: datos.tipoCentro,
    exp: ahora + TTL_MS,
  })).toString('base64url');
  return `${payload}.${firma(payload, opciones.secreto ?? secretoPorDefecto())}`;
}

/** `null` si está manipulado, caducado o no es de aquí. Nunca lanza por el token. */
export function verificarSesionDemo(
  token: unknown,
  opciones: { ahora?: number; secreto?: string } = {},
): DatosSesionDemo | null {
  if (typeof token !== 'string' || token.length > 1000) return null;
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  const [payloadB64, firmaRecibida] = partes;
  let esperada: Buffer;
  try {
    esperada = Buffer.from(firma(payloadB64, opciones.secreto ?? secretoPorDefecto()));
  } catch {
    return null;
  }
  const recibida = Buffer.from(firmaRecibida);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    const d = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as Record<string, unknown>;
    if (d.v !== 'demo') return null;
    if (typeof d.exp !== 'number' || d.exp < (opciones.ahora ?? Date.now())) return null;
    if (typeof d.s !== 'string' || !d.s || typeof d.l !== 'string' || !d.l || typeof d.n !== 'boolean') return null;
    if (!esTipoCentro(d.t)) return null;
    return { sid: d.s, leadId: d.l, nuevo: d.n, tipoCentro: d.t };
  } catch {
    return null;
  }
}

// El pase de acceso de la clienta: el QR que enseña al llegar y el código corto
// que se puede teclear cuando la cámara no va.
//
// Qué protege esto y por qué no vale cualquier cosa: hacer check-in NO es solo
// marcar una casilla. `checkinPublico` otorga créditos canjeables, dispara el
// premio de referido y mueve racha y logros. Por eso el kiosko lleva token de
// dispositivo desde la auditoría C-2: sin él, cualquiera podía POSTear un
// reservaId —que son públicos— y acuñar créditos. El pase hereda esa regla:
// enseñarlo no marca nada, marcar lo hace el ESTUDIO al leerlo.
//
// Las dos piezas son distintas a propósito:
//
//  · **El QR lleva un token firmado y caduca en 2 minutos.** La app lo renueva
//    mientras la hoja está abierta. No es paranoia: sin caducidad, una captura
//    reenviada por WhatsApp abre la puerta del estudio (el escaneo dispara
//    Kisi). Dos minutos deja la captura inservible antes de llegar al portal.
//  · **El código corto NO caduca**, pero solo sirve dentro de la ventana de su
//    clase y solo desde una sesión de personal. Rota nada — un código que
//    cambia mientras la instructora lo teclea es un código que no se usa.

import { createHmac, timingSafeEqual } from 'crypto';

// ── Ventana ──────────────────────────────────────────────────────────────────
//
// Una hora antes: en Pilates se llega pronto, y el pase tiene que estar listo
// cuando la clienta va de camino. Quince minutos después de empezar: pasado ese
// rato ya no es "llegar", es que la instructora lo marque a mano y decida ella.
const ANTES_MIN = 60;
const DESPUES_MIN = 15;

export function ventanaDelPase(inicioSesion: Date): { desde: Date; hasta: Date } {
  return {
    desde: new Date(inicioSesion.getTime() - ANTES_MIN * 60_000),
    hasta: new Date(inicioSesion.getTime() + DESPUES_MIN * 60_000),
  };
}

export function paseVigente(inicioSesion: Date, ahora: Date): boolean {
  const { desde, hasta } = ventanaDelPase(inicioSesion);
  return ahora >= desde && ahora <= hasta;
}

/** Minutos que faltan para que el pase se active. 0 si ya está vigente o pasó. */
export function minutosParaActivarse(inicioSesion: Date, ahora: Date): number {
  const { desde } = ventanaDelPase(inicioSesion);
  return ahora >= desde ? 0 : Math.ceil((desde.getTime() - ahora.getTime()) / 60_000);
}

// ── Secreto ──────────────────────────────────────────────────────────────────
//
// Se reutiliza el mismo secreto que los enlaces de instructora en vez de pedir
// una variable de entorno nueva: ya está puesto en producción, y bloquear una
// funcionalidad entera en un despliegue de configuración es cómo se quedan las
// cosas a medias. El `scope` separado impide que un token de un sitio valga en
// el otro aunque compartan clave.
function secreto(): string {
  const s = process.env.SUSTITUCION_TOKEN_SECRET || process.env.OAUTH_STATE_SECRET;
  if (!s) throw new Error('Falta SUSTITUCION_TOKEN_SECRET (u OAUTH_STATE_SECRET) para firmar el pase');
  return s;
}

function firma(datos: string): string {
  return createHmac('sha256', secreto()).update(`pase-acceso:${datos}`).digest('base64url');
}

/** Comparación en tiempo constante; longitudes distintas no llegan a compararse. */
function igual(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// ── Token del QR ─────────────────────────────────────────────────────────────

const TTL_MS = 120_000;

export function firmarPase(reservaId: string, studioId: string, ahora: number = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ r: reservaId, s: studioId, exp: ahora + TTL_MS })).toString('base64url');
  return `${payload}.${firma(payload)}`;
}

export function verificarPase(
  token: string | null | undefined,
  ahora: number = Date.now(),
): { reservaId: string; studioId: string } | null {
  if (!token) return null;
  const punto = token.indexOf('.');
  if (punto <= 0) return null;
  const payload = token.slice(0, punto);
  if (!igual(firma(payload), token.slice(punto + 1))) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { r?: unknown; s?: unknown; exp?: unknown };
    if (typeof d.exp !== 'number' || d.exp < ahora) return null;
    if (typeof d.r !== 'string' || !d.r || typeof d.s !== 'string' || !d.s) return null;
    return { reservaId: d.r, studioId: d.s };
  } catch {
    return null;
  }
}

// ── Código corto ─────────────────────────────────────────────────────────────
//
// Alfabeto sin las letras que se confunden al dictarlas o teclearlas: fuera
// I/1, O/0, U (se oye como O) y S/5. Quedan 27 símbolos; 6 posiciones dan ~387
// millones de combinaciones, y el endpoint que los comprueba va con límite de
// peticiones y sesión de personal.
const ALFABETO = '23456789ABCDEFGHJKLMNPQRTVWXYZ';

export function codigoCorto(reservaId: string): string {
  const bytes = Buffer.from(firma(`corto:${reservaId}`), 'base64url');
  let out = '';
  for (let i = 0; i < 6; i++) out += ALFABETO[bytes[i] % ALFABETO.length];
  return out;
}

/** Normaliza lo que teclea la instructora: espacios, minúsculas y guiones fuera. */
export function normalizarCodigo(v: string): string {
  return v.replace(/[\s-]/g, '').toUpperCase();
}

export function codigoCortoValido(codigo: string, reservaId: string): boolean {
  const limpio = normalizarCodigo(codigo);
  return limpio.length === 6 && igual(limpio, codigoCorto(reservaId));
}

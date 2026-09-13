import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

// C-8: `state` firmado para los flujos OAuth (Stripe Connect, Google Calendar,
// Gmail, Zoom y Klaviyo).
//
// Antes el `state` era el studioId EN CLARO: los callbacks (GET no autenticado)
// se fiaban de él y vinculaban la cuenta de pagos / calendario a ESE estudio.
// Como los studioId son enumerables, cualquiera podía completar el flujo con
// state=<estudio_víctima> y conectar SU cuenta a la víctima (CSRF de binding →
// desvío de fondos en el caso de Stripe).
//
// Después el `state` pasó a ser `payload.hmac`, con payload =
// base64url({studioId, provider, exp, ...}) firmado con OAUTH_STATE_SECRET.
//
// Pero firmado no es lo mismo que ligado a quien lo pidió: un PROPIETARIO de
// SU propio estudio podía pedir un state válido, meterlo en una URL de
// autorización legítima y mandársela a otra persona. Esa persona aceptaba el
// consentimiento real y sus tokens (Gmail, Calendar, Zoom, Klaviyo, Stripe) se
// guardaban en el estudio del que había pedido el state.
//
// Ahora el flujo tiene DOS mitades que tienen que llegar juntas al callback:
//   - una cookie HttpOnly con un nonce aleatorio (y, en Klaviyo, el
//     code_verifier de PKCE), acotada a la ruta del callback de ESE proveedor;
//   - el `state`, que lleva firmado el SHA-256 de esa cookie, nunca la cookie.
// Quien recibe un enlace ajeno no tiene la cookie en su navegador, así que el
// callback lo rechaza sin escribir credenciales. La cookie no se puede fijar
// desde otro sitio (HttpOnly, host-only, emitida por una ruta autenticada).
//
// `ahora` se inyecta para poder testear el helper de forma determinista.

const TTL_MS = 10 * 60 * 1000;

export type ProveedorOAuth = 'stripe' | 'google' | 'gmail' | 'zoom' | 'klaviyo';

// La cookie de cada flujo solo viaja a SU callback: una cookie de Gmail nunca
// llega al callback de Zoom, y no sale en ninguna otra petición del panel.
export const RUTA_CALLBACK_OAUTH: Readonly<Record<ProveedorOAuth, string>> = {
  stripe: '/api/stripe/connect/callback',
  google: '/api/integrations/google-calendar/callback',
  gmail: '/api/integrations/gmail/callback',
  zoom: '/api/integrations/zoom/callback',
  klaviyo: '/api/integrations/klaviyo/callback',
};

export function nombreCookieOAuth(provider: ProveedorOAuth): string {
  return `tentare_oauth_${provider}`;
}

export interface OpcionesCookieOAuth {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
}

// `lax` y no `strict`: el proveedor devuelve al navegador con una navegación
// GET de nivel superior desde SU dominio, y `strict` no mandaría la cookie ahí.
// `secure` solo en producción, mismo criterio que `acceso-pagina`: en local se
// sirve por http.
export function opcionesCookieOAuth(
  provider: ProveedorOAuth,
  secure = process.env.NODE_ENV === 'production',
): OpcionesCookieOAuth {
  return { httpOnly: true, secure, sameSite: 'lax', path: RUTA_CALLBACK_OAUTH[provider], maxAge: TTL_MS / 1000 };
}

// Valor de la cookie: `nonce` o `nonce.codeVerifier`. Los dos son base64url,
// que no contiene '.', así que el separador no es ambiguo.
export function crearCookieOAuth(codeVerifier?: string): string {
  const nonce = randomBytes(32).toString('base64url');
  return codeVerifier ? `${nonce}.${codeVerifier}` : nonce;
}

// Borrar exige la MISMA ruta con la que se fijó: con otra, el navegador la
// trata como una cookie distinta y la deja viva hasta que caduque.
// Tipado estructural para no arrastrar `next/server` a un módulo que se prueba
// con `node --test`.
export function borrarCookieOAuth(
  res: { cookies: { set(name: string, value: string, opciones: OpcionesCookieOAuth): unknown } },
  provider: ProveedorOAuth,
): void {
  res.cookies.set(nombreCookieOAuth(provider), '', { ...opcionesCookieOAuth(provider), maxAge: 0 });
}

function secret(): string {
  const s = process.env.OAUTH_STATE_SECRET;
  if (!s) throw new Error('OAUTH_STATE_SECRET no configurada');
  return s;
}

function firmar(payloadB64: string): string {
  return createHmac('sha256', secret()).update(payloadB64).digest('base64url');
}

function huellaCookie(valorCookie: string): string {
  return createHash('sha256').update(valorCookie).digest('base64url');
}

function igualesEnTiempoConstante(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function firmarEstadoOAuth(
  studioId: string,
  provider: ProveedorOAuth,
  ahora: number,
  valorCookie: string,
): string {
  if (!valorCookie) throw new Error('Falta la cookie del flujo OAuth');
  const payload = { studioId, provider, exp: ahora + TTL_MS, nh: huellaCookie(valorCookie) };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${payloadB64}.${firmar(payloadB64)}`;
}

export function verificarEstadoOAuth(
  state: string | null | undefined,
  provider: ProveedorOAuth,
  ahora: number,
  valorCookie: string | null | undefined,
): { studioId: string; codeVerifier?: string } | null {
  // Sin cookie no hay nada que comprobar: o el flujo no empezó en este
  // navegador, o ya caducó.
  if (!state || !valorCookie) return null;
  const punto = state.indexOf('.');
  if (punto <= 0) return null;
  const payloadB64 = state.slice(0, punto);
  const sig = state.slice(punto + 1);

  if (!igualesEnTiempoConstante(firmar(payloadB64), sig)) return null;

  try {
    const data = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as {
      studioId?: unknown; provider?: unknown; exp?: unknown; nh?: unknown;
    };
    if (data.provider !== provider) return null;
    if (typeof data.exp !== 'number' || data.exp < ahora) return null;
    if (typeof data.studioId !== 'string' || data.studioId.length === 0) return null;
    if (typeof data.nh !== 'string' || !igualesEnTiempoConstante(huellaCookie(valorCookie), data.nh)) return null;

    const sep = valorCookie.indexOf('.');
    const codeVerifier = sep > 0 ? valorCookie.slice(sep + 1) : '';
    return { studioId: data.studioId, ...(codeVerifier ? { codeVerifier } : {}) };
  } catch {
    return null;
  }
}

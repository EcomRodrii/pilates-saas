// Reglas puras del puente de sesión del widget embebido
// (app/widget-auth-retorno). Sin dependencias de navegador ni de Supabase para
// poder probarlas con `node --test`.
//
// La garantía que sostienen: el puente solo reenvía al widget una sesión que
// nació de un acceso por email completado DESPUÉS de abrirse ese puente, y el
// widget solo acepta el mensaje del intento que él mismo inició. Una sesión que
// ya estuviera guardada en el navegador nunca sale por aquí.

import { payloadJwt } from '../auth/payload-jwt.ts';

/**
 * Métodos `amr` de gotrue que prueban posesión del email.
 *
 * - `otp`: lo que emite gotrue al verificar un enlace o código de email en flujo
 *   implícito (el de `supabasePortal`) — `verifyGet`/`verifyPost` llaman a
 *   `issueRefreshToken(..., models.OTP, ...)`.
 * - `magiclink` / `email/signup`: los que emitiría el flujo PKCE, que toma el
 *   método del `type` del enlace. Se aceptan para no romper si algún día se
 *   cambia de flujo; siguen siendo prueba de email.
 *
 * Contraseña, OAuth, refresco de token, anónima, etc. quedan fuera a propósito.
 */
const METODOS_EMAIL = new Set(['otp', 'magiclink', 'email/signup']);

/** Desfase de reloj tolerado entre quien abre el puente y gotrue. */
export const TOLERANCIA_PUENTE_MS = 30_000;

/**
 * ¿Este access token viene de un acceso por email posterior a `desdeMs`?
 *
 * No verifica la firma (eso lo hace Supabase cuando el token se usa): solo
 * decide si el puente debe REENVIARLO. Falla cerrado ante cualquier cosa rara —
 * token malformado, `amr` ausente o en formato sin fecha, otro método.
 */
export function sesionAutenticadaPorEmailDespuesDe(
  accessToken: string,
  desdeMs: number,
  toleranciaMs: number = TOLERANCIA_PUENTE_MS,
): boolean {
  return autenticadaConDespuesDe(METODOS_EMAIL, accessToken, desdeMs, toleranciaMs);
}

/**
 * ¿La sesión que devolvió el acceso con CONTRASEÑA de la ventana del puente es
 * de ahora? Defensa en profundidad: esa sesión sale del propio
 * `signInWithPassword` de la ventana (con un cliente sin almacenamiento, nunca
 * de lo guardado en el navegador), pero se comprueba igual que la del correo:
 * método `password` y posterior a abrirse el puente.
 */
export function sesionPorContrasenaDespuesDe(
  accessToken: string,
  desdeMs: number,
  toleranciaMs: number = TOLERANCIA_PUENTE_MS,
): boolean {
  return autenticadaConDespuesDe(METODO_CONTRASENA, accessToken, desdeMs, toleranciaMs);
}

const METODO_CONTRASENA = new Set(['password']);

function autenticadaConDespuesDe(
  metodos: ReadonlySet<string>,
  accessToken: string,
  desdeMs: number,
  toleranciaMs: number,
): boolean {
  if (typeof accessToken !== 'string' || !Number.isFinite(desdeMs)) return false;
  const payload = payloadJwt(accessToken);
  if (!payload || typeof payload !== 'object') return false;
  const amr = (payload as { amr?: unknown }).amr;
  if (!Array.isArray(amr)) return false;
  const limite = desdeMs - Math.max(0, toleranciaMs);
  return amr.some((entrada) => {
    if (!entrada || typeof entrada !== 'object') return false;
    const { method, timestamp } = entrada as { method?: unknown; timestamp?: unknown };
    return typeof method === 'string'
      && metodos.has(method)
      && typeof timestamp === 'number'
      && Number.isFinite(timestamp)
      && timestamp * 1000 >= limite;
  });
}

/**
 * Identificador de un intento de acceso por enlace (lo genera el widget con
 * `crypto.randomUUID()`). Solo se valida la forma: no es un secreto, sirve para
 * que el widget descarte mensajes que no son de su intento en curso.
 */
export function nonceValido(nonce: unknown): nonce is string {
  return typeof nonce === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(nonce);
}

// ── El código del correo, dentro del puente ─────────────────────────────────
//
// A una alumna NUEVA no le llega el enlace: gotrue le manda el correo de alta,
// que solo trae un código de 6 cifras (lib/student/codigo-del-correo.ts). Ese
// código se escribe en la ventana del puente —la que el widget acaba de abrir y
// tiene el foco—, que es mismo origen que el endpoint que lo comprueba. La
// sesión que abre pasa por el MISMO filtro que la de un enlace
// (`sesionAutenticadaPorEmailDespuesDe`), así que el puente no gana ninguna vía
// nueva de reenviar sesiones.
//
// Para comprobar el código hace falta el email, y no viaja en la URL (serían
// datos personales en el historial): el puente avisa al widget de que está
// listo y el widget le contesta con el email del intento. Los dos mensajes
// llevan el nonce del intento, y cada lado comprueba además el origen.
export const TIPO_PUENTE_LISTO = 'tentare-widget-puente-listo';
export const TIPO_EMAIL_DEL_INTENTO = 'tentare-widget-email';

/** Lo que el widget acepta del puente: su aviso de «listo», del intento en curso. */
export function esAvisoPuenteListo(datos: unknown, nonceEnCurso: string | null): boolean {
  if (!nonceEnCurso || !datos || typeof datos !== 'object') return false;
  const { tipo, nonce } = datos as { tipo?: unknown; nonce?: unknown };
  return tipo === TIPO_PUENTE_LISTO && nonce === nonceEnCurso;
}

/**
 * El email que el widget manda al puente, o `null` si el mensaje no es del
 * intento de este puente o no trae un email con forma de email.
 */
export function emailDelIntento(datos: unknown, nonce: string | null): string | null {
  if (!nonce || !datos || typeof datos !== 'object') return null;
  const { tipo, nonce: suNonce, email } = datos as { tipo?: unknown; nonce?: unknown; email?: unknown };
  if (tipo !== TIPO_EMAIL_DEL_INTENTO || suNonce !== nonce || typeof email !== 'string') return null;
  return emailConForma(email);
}

function emailConForma(email: string): string | null {
  const limpio = email.trim();
  return limpio.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio) ? limpio : null;
}

// ── El acceso entero, en la ventana de Tentare (16-oct-2026) ────────────────
//
// La site key de Turnstile solo vale en los dominios que Cloudflare tiene
// autorizados (tentare.app): en la web de un estudio devuelve el error 110200
// y no da token, y sin token gotrue rechaza todo acceso (el captcha se exige a
// nivel de PROYECTO). Así que el widget ya no pide el captcha en la web del
// estudio: abre esta misma ventana del puente, en tentare.app, y le ENCARGA el
// acceso (entrar con contraseña o mandar el correo). La ventana pasa el
// captcha, llama a gotrue y devuelve el resultado.
//
// Las garantías del puente siguen en pie (ver app/widget-auth-retorno/page.tsx):
// destino resuelto en servidor contra `widget_dominios_autorizados`, un intento
// por nonce, y la ventana solo acepta el encargo de la ventana que la abrió,
// desde ese destino. Además, UN encargo por ventana: abrirla no da una
// herramienta para probar contraseñas en bucle con el captcha ya pasado.
export const TIPO_ENCARGO_ACCESO = 'tentare-widget-acceso';
/** El resultado que el puente devuelve al widget: el tipo de siempre, ahora también con error. */
export const TIPO_RESULTADO_ACCESO = 'tentare-widget-auth';
export const TIPO_ENLACE_ENVIADO = 'tentare-widget-enlace-enviado';

export type EncargoAcceso =
  | { accion: 'password'; email: string; password: string }
  | { accion: 'enlace'; email: string };

/** De sobra para gotrue (bcrypt corta en 72 bytes); lo que pase de aquí no es una contraseña. */
const MAX_PASSWORD = 256;
/** Un error es una frase para la alumna, no un volcado. */
const MAX_ERROR = 300;

/** El mensaje con el que el widget encarga el acceso a la ventana del puente. */
export function mensajeEncargo(nonce: string, encargo: EncargoAcceso) {
  return { tipo: TIPO_ENCARGO_ACCESO, nonce, ...encargo };
}

/**
 * El encargo que el puente acepta: el de SU intento, con un email con forma de
 * email y, si es con contraseña, una contraseña no vacía y de tamaño razonable.
 * Cualquier otra cosa → `null` (no se hace nada).
 */
export function encargoDelIntento(datos: unknown, nonce: string | null): EncargoAcceso | null {
  if (!nonce || !datos || typeof datos !== 'object') return null;
  const { tipo, nonce: suNonce, accion, email, password } = datos as Record<string, unknown>;
  if (tipo !== TIPO_ENCARGO_ACCESO || suNonce !== nonce || typeof email !== 'string') return null;
  const limpio = emailConForma(email);
  if (!limpio) return null;
  if (accion === 'enlace') return { accion, email: limpio };
  if (accion === 'password' && typeof password === 'string' && password.length > 0 && password.length <= MAX_PASSWORD) {
    return { accion, email: limpio, password };
  }
  return null;
}

export type ResultadoPuente =
  | { tipo: 'sesion'; access_token: string; refresh_token: string }
  | { tipo: 'error'; error: string }
  | { tipo: 'enlace-enviado' };

/**
 * Lo que el widget acepta del puente para el intento en curso. El ORIGEN y la
 * VENTANA los comprueba quien escucha; esto mira la forma y el nonce.
 */
export function resultadoDelPuente(datos: unknown, nonceEnCurso: string | null): ResultadoPuente | null {
  if (!nonceEnCurso || !datos || typeof datos !== 'object') return null;
  const d = datos as Record<string, unknown>;
  if (d.nonce !== nonceEnCurso) return null;
  if (d.tipo === TIPO_ENLACE_ENVIADO) return { tipo: 'enlace-enviado' };
  if (d.tipo !== TIPO_RESULTADO_ACCESO) return null;
  if (d.ok === true) {
    if (typeof d.access_token !== 'string' || !d.access_token || typeof d.refresh_token !== 'string' || !d.refresh_token) return null;
    return { tipo: 'sesion', access_token: d.access_token, refresh_token: d.refresh_token };
  }
  if (d.ok === false && typeof d.error === 'string' && d.error.trim()) {
    return { tipo: 'error', error: d.error.trim().slice(0, MAX_ERROR) };
  }
  return null;
}

/**
 * La URL de la ventana del puente. `origenEstudio` es el origen de la web que
 * la abre: el servidor lo vuelve a comprobar contra la lista del estudio, así
 * que aquí no decide nada. Es también el `emailRedirectTo` del correo: el
 * enlace vuelve a esta misma página, con el mismo nonce.
 */
export function urlPuente(baseUrl: string, slug: string, origenEstudio: string, nonce: string): string {
  return `${baseUrl}/widget-auth-retorno?slug=${encodeURIComponent(slug)}&origenEstudio=${encodeURIComponent(origenEstudio)}&nonce=${encodeURIComponent(nonce)}`;
}

/** Salida de siempre cuando la ventana no se puede usar: la página de reservas entera, en tentare.app. */
export function urlReservarCompleta(baseUrl: string, slug: string): string {
  return `${baseUrl}/reservar/${encodeURIComponent(slug)}`;
}

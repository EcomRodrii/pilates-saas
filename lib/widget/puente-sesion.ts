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
      && METODOS_EMAIL.has(method)
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
  const limpio = email.trim();
  return limpio.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio) ? limpio : null;
}

// El token del enlace de invitación tiene que sobrevivir a un viaje largo:
//
//   /invitacion?token=…  →  /login  →  alta  →  email de confirmación  →  /login
//
// Por eso hay dos almacenes y no uno. `sessionStorage` cubre el tramo dentro de
// la misma pestaña (la persona pulsa "crear mi cuenta" y va al formulario), y la
// metadata de la cuenta de Supabase cubre el rebote del email, que puede abrirse
// horas después y desde otro dispositivo — mismo truco que `pending_studio`.
//
// No se pasa por la URL a propósito: `emailRedirectTo` tiene que coincidir con
// las redirect URLs permitidas del proyecto de Supabase, y colgarle un query
// string es la clase de detalle que funciona en local y deja de funcionar en
// producción sin decir por qué.

export const CLAVE_INVITACION = 'pending_invitacion';

export function recordarTokenInvitacion(token: string) {
  try { sessionStorage.setItem(CLAVE_INVITACION, token); } catch { /* modo privado, navegador antiguo */ }
}

export function leerTokenInvitacion(): string | null {
  try { return sessionStorage.getItem(CLAVE_INVITACION); } catch { return null; }
}

export function olvidarTokenInvitacion() {
  try { sessionStorage.removeItem(CLAVE_INVITACION); } catch { /* ídem */ }
}

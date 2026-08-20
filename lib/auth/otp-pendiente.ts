// El email de la cuenta a la espera de verificación tiene que sobrevivir a un
// recargo de página o un botón atrás dentro de la MISMA pestaña — a
// diferencia del token de invitación (ver equipo/invitacion-pendiente.ts),
// aquí no hace falta que sobreviva a un salto a otro dispositivo: el código
// se escribe en la misma pestaña donde se pidió, nunca se abre un enlace.
// sessionStorage basta.

const CLAVE = 'pending_otp_email';

export function recordarEmailOtpPendiente(email: string) {
  try { sessionStorage.setItem(CLAVE, email); } catch { /* modo privado, navegador antiguo */ }
}

export function leerEmailOtpPendiente(): string | null {
  try { return sessionStorage.getItem(CLAVE); } catch { return null; }
}

export function olvidarEmailOtpPendiente() {
  try { sessionStorage.removeItem(CLAVE); } catch { /* ídem */ }
}

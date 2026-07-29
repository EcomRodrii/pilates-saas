// ─────────────────────────────────────────────────────────────────────────────
// Un token de Turnstile se gasta al usarlo. UNA vez.
//
// El widget lo emitía una sola vez y no se refrescaba nunca, así que en cuanto
// una llamada de auth lo consumía, TODO lo que viniera después en esa misma
// carga de página fallaba con:
//
//     captcha_failed — captcha protection: request disallowed (timeout-or-duplicate)
//
// En la práctica eso significaba **un intento por carga de página**, en todas
// las pantallas con captcha: login del equipo, alta de estudio, login y acceso
// del portal, y la reserva pública. Te equivocas de contraseña una vez y el
// segundo intento ya no falla por la contraseña — falla por el captcha, y el
// mensaje te manda a recargar sin explicar por qué.
//
// Se arregla aquí y no en cada pantalla a propósito. Ese fue exactamente el
// error que trajo el captcha: pedirle a cada formulario que se acuerde de algo.
// Quien gasta el token es la capa de auth, así que es la capa de auth la que
// avisa, y el widget se refresca solo — da igual desde qué pantalla se llame,
// y una pantalla nueva lo hereda sin tener que enterarse de que esto existe.
// ─────────────────────────────────────────────────────────────────────────────

type Oyente = () => void;

const oyentes = new Set<Oyente>();

/** El widget se suscribe para refrescarse. Devuelve cómo darse de baja. */
export function alGastarCaptcha(fn: Oyente): () => void {
  oyentes.add(fn);
  return () => { oyentes.delete(fn); };
}

/**
 * Lo llama la capa de auth DESPUÉS de una petición que llevaba token, haya ido
 * bien o mal — porque en los dos casos el token queda gastado, y es el camino
 * de error el que importa: es cuando la persona va a reintentar.
 */
export function captchaGastado(): void {
  for (const fn of oyentes) fn();
}

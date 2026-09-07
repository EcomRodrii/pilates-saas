// Los errores de gotrue, traducidos y clasificados. Sin imports ni `@/`.
//
// ⚠️ Vive aparte para poder PROBARSE. Estaba dentro de `auth.ts`, que importa
// el cliente de Supabase y no se puede cargar con `node --test`; la única forma
// de cubrirlo era conducir el formulario de acceso con Playwright, y eso
// resultó ser una pelea con la hidratación —el clic llegaba antes de que React
// enganchara el manejador y se perdía— que fallaba en casos distintos cada
// vuelta sin encontrar un solo defecto del producto.
//
// La regla es pura: de un texto a un mensaje y un código. Aquí se prueba en
// milisegundos y sin carreras.

/**
 * El caso que hay que poder distinguir sin leer textos.
 *
 * `sin-confirmar` es el que importa: quien se registró y no abrió el correo no
 * puede entrar, y el mensaje solo era un callejón —«mira tu correo»— sin
 * ninguna acción. Ese callejón tiene consecuencia: la salida natural es pulsar
 * «Continuar con Google», y como gotrue solo vincula identidades cuando el
 * email de la cuenta existente está CONFIRMADO, ahí nace una SEGUNDA cuenta.
 * Medido en producción: 18 de 57 usuarios están en ese estado.
 */
export type CodigoAuth = 'sin-confirmar';

/** Qué clase de fallo es, para poder ofrecer la salida correcta. */
export function codigoDeError(mensaje: string): CodigoAuth | undefined {
  const m = (mensaje ?? '').toLowerCase();
  // Se acepta el texto Y el `error_code` de gotrue: las versiones nuevas
  // mandan `email_not_confirmed` y las viejas «Email not confirmed». Atarse a
  // uno solo dejaría el caso sin detectar en cuanto cambiara la versión.
  return m.includes('email not confirmed') || m.includes('email_not_confirmed')
    ? 'sin-confirmar'
    : undefined;
}

/**
 * De un error de gotrue a algo que una alumna entienda, o `null` si no lo
 * reconocemos.
 *
 * ⚠️ Devuelve `null` en vez de un texto por defecto A PROPÓSITO. Quien llama
 * aplica `mensajeSeguro`, que deja pasar los mensajes legibles y solo sustituye
 * los técnicos. Devolver aquí el respaldo perdería los mensajes específicos que
 * gotrue sí redacta bien — y ese matiz a veces es lo único que dice qué hacer.
 */
export function traducirAuth(mensaje: string): string | null {
  const m = (mensaje ?? '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email o contraseña incorrectos.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos. Espera un minuto y vuelve a intentarlo.';
  if (codigoDeError(mensaje) === 'sin-confirmar') return 'Tienes que confirmar tu email antes de entrar.';
  if (m.includes('user already registered')) return 'Ya existe una cuenta con ese email. Entra con tu contraseña o pide un enlace.';
  if (m.includes('should be at least') || m.includes('password')) return 'La contraseña es demasiado corta. Usa al menos 8 caracteres.';
  return null;
}

/**
 * ¿El fallo es «ese email ya es de otra cuenta»?
 *
 * Vive aparte de `traducirAuth` porque el MISMO fallo pide dos textos según
 * quién pregunte: al registrarse la salida es «entra con tu contraseña», y al
 * cambiar de email es «ese email ya está en uso». Una sola traducción tendría
 * que elegir una y equivocarse en la otra, así que aquí solo se clasifica y el
 * texto lo pone quien llama.
 *
 * Se aceptan las tres formas de gotrue —`email_exists`, «already been
 * registered» y «already registered»— por la misma razón que en
 * `codigoDeError`: atarse a una la deja sin detectar al subir de versión.
 */
export function emailYaEnUso(mensaje: string): boolean {
  const m = (mensaje ?? '').toLowerCase();
  return m.includes('email_exists') || m.includes('already registered') || m.includes('already been registered');
}

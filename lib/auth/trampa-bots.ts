// El campo trampa (honeypot) del formulario público de interés.
//
// Por qué existe: `/api/public/interes-lanzamiento` puede verificar el captcha
// contra Cloudflare (`captcha-servidor.ts`), pero eso depende de que
// `TURNSTILE_SECRET_KEY` esté puesta en el entorno — y si no lo está, el
// endpoint se queda solo con el límite por IP. Esto protege **sin depender de
// ninguna clave, cuenta ni servicio externo**: funciona siempre, incluso en
// local y en las preview.
//
// Cómo funciona: el formulario pinta un campo que una persona NO puede ver ni
// enfocar (fuera de pantalla, `aria-hidden`, sin tabulación). Un bot que
// rellena todo lo que encuentra en el DOM sí lo rellena, y se delata.
//
// ⚠️ El nombre del campo vive AQUÍ y no escrito a mano en los dos lados. Si el
// formulario y el servidor dejaran de coincidir, la trampa quedaría desactivada
// **en silencio**: nadie caería en ella y todo parecería correcto. Es el mismo
// tipo de fallo mudo que el captcha que no verificaba nada.
//
// Qué NO hace, a propósito:
// - No mide el tiempo de relleno. Lo típico sería rechazar envíos de menos de
//   dos segundos, pero eso obliga a fiarse del reloj del navegador, que quien
//   escribe el bot controla; y con el reloj del servidor haría falta firmar una
//   marca de tiempo. Mucha maquinaria para un formulario de captación.
// - No bloquea a un bot hecho a medida para este formulario. Nada de esto lo
//   hace; para eso está la verificación del captcha en el servidor.

/** El nombre del campo. Plausible a propósito: un bot lo ve como uno más. */
export const CAMPO_TRAMPA = 'web';

/**
 * ¿Vino relleno? Solo entonces es un bot.
 *
 * Se ignoran los espacios en blanco: un `' '` suelto puede llegar de un
 * autorrelleno del navegador sobre un campo que no debería haber tocado, y
 * tratarlo como bot descartaría un alta real sin dejar rastro.
 */
export function cayoEnLaTrampa(valor: unknown): boolean {
  return typeof valor === 'string' && valor.trim() !== '';
}

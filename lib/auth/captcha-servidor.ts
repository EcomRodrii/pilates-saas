// Verificación de un token de Turnstile CONTRA CLOUDFLARE, en el servidor.
//
// ⚠️ Por qué hace falta esto, si ya hay captcha en media docena de pantallas:
// en todas esas, quien verifica el token es **gotrue** (el captcha se exige a
// nivel de proyecto en Supabase), así que la app nunca tuvo que comprobar
// nada. Un endpoint propio como `/api/public/interes-lanzamiento` no pasa por
// gotrue: si nadie llama al `siteverify`, el token es un adorno y un bot que
// llame a la API directamente —sin abrir el formulario— entra igual.
//
// Ese era el estado real hasta ahora, y estaba escrito en el propio
// `/crear-estudio`: el widget bloqueaba el botón pero la petición **jamás
// incluyó el token**, así que frenaba a personas y a ningún bot.
//
// ⚠️ El token se GASTA al verificarlo: `siteverify` acepta cada token una sola
// vez (`timeout-or-duplicate` a partir de la segunda). Quien lo use tiene que
// avisar al widget con `captchaGastado()`, igual que hace la capa de auth.

/**
 * - `'ok'`           → verificado, o no hay nada que verificar (sin secreto).
 * - `'sin-token'`    → hay secreto configurado y no llegó token.
 * - `'invalido'`     → Cloudflare dice que no.
 */
export type ResultadoCaptcha = 'ok' | 'sin-token' | 'invalido';

const URL_VERIFICACION = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Cuánto se espera a Cloudflare antes de rendirse. */
const ESPERA_MS = 5_000;

/**
 * Comprueba el token contra Cloudflare.
 *
 * **Sin `TURNSTILE_SECRET_KEY` devuelve `'ok'` sin llamar a nadie**, y no es un
 * agujero disimulado: es el mismo criterio que ya usa el widget con
 * `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. En local y en las preview de Vercel no hay
 * claves, y exigir un token que el cliente no puede emitir dejaría el
 * formulario muerto en todos los entornos menos producción. Se registra en
 * consola para que "no está protegido" no pase inadvertido.
 *
 * ⚠️ **Fail-OPEN si la llamada a Cloudflare no llega a completarse** (red
 * caída, timeout), fail-CLOSED si Cloudflare responde que el token no vale.
 * La diferencia importa: un veredicto negativo es una señal, y un fallo de
 * transporte no es señal de nada — y no lo puede provocar quien envía el
 * formulario, porque esta petición sale de nuestro servidor. Cerrar ahí
 * significaría perder altas reales cada vez que Cloudflare tenga un mal rato.
 *
 * `fetchImpl` existe para el test: sin él habría que mockear el `fetch` global.
 */
export async function verificarCaptcha(
  token: string | undefined,
  opciones?: { ip?: string; fetchImpl?: typeof fetch; secreto?: string },
): Promise<ResultadoCaptcha> {
  const secreto = opciones?.secreto ?? process.env.TURNSTILE_SECRET_KEY;
  if (!secreto) {
    // Deja rastro: «no protege» no puede ser silencioso. Sin esto, la única
    // forma de saber si la variable llega era mandar un token falso y deducirlo
    // del mensaje de error — que es como se descubrió que faltaba.
    console.warn('[captcha] sin TURNSTILE_SECRET_KEY: no se verifica ningún token');
    return 'ok';
  }
  if (!token) return 'sin-token';

  const hacerFetch = opciones?.fetchImpl ?? fetch;
  const cuerpo = new URLSearchParams({ secret: secreto, response: token });
  if (opciones?.ip) cuerpo.set('remoteip', opciones.ip);

  try {
    const res = await hacerFetch(URL_VERIFICACION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: cuerpo.toString(),
      signal: AbortSignal.timeout(ESPERA_MS),
    });
    // Un 5xx de Cloudflare tampoco es un veredicto: es la misma avería que un
    // timeout, y se trata igual.
    if (!res.ok) {
      console.error('[captcha] siteverify respondió', res.status);
      return 'ok';
    }
    const datos = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (datos.success === true) return 'ok';
    console.warn('[captcha] token rechazado', datos['error-codes']);
    return 'invalido';
  } catch (e) {
    console.error('[captcha] no se ha podido verificar, se deja pasar', e);
    return 'ok';
  }
}

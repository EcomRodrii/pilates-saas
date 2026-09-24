'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import { alGastarCaptcha } from '@/lib/auth/captcha-usado';
import { ejecutarWidget, leerTokenDelWidget, reiniciarWidget } from '@/lib/auth/turnstile-vivo';

// Cloudflare Turnstile, sin librería de npm: el embed oficial es un <script>
// global + un div, y esto lo envuelve en un hook.
//
// Protege alta de estudio (app/crear-estudio), login de equipo (app/login), el
// portal de socias (app/portal/[slug]/{acceso,login}), la reserva pública
// (app/reservar/[slug]) y el cambio de contraseña (configuracion/tab-perfil).
//
// ⚠️ El captcha se exige a nivel de PROYECTO en Supabase, no por pantalla: en
// cuanto se activó, cualquier login o alta sin token empezó a fallar con
// «captcha protection: request disallowed». Cubrir solo una parte de las
// pantallas de auth no es una opción real con este modelo.
//
// Sin NEXT_PUBLIC_TURNSTILE_SITE_KEY no se monta nada y `pedirToken` devuelve
// `''` — «no hay nada que pedir». Eso NO quiere decir que local o las preview
// funcionen: gotrue sigue rechazando sin token si el captcha está activo en el
// proyecto. Para trabajar en local: poner la env var (vale la site key de
// prueba de Cloudflare, `1x00000000000000000000AA`) o apagar el captcha en
// Authentication → Settings.

// ═══════════════════════════════════════════════════════════════════════════
// POR QUÉ ES UN HOOK Y NO UN COMPONENTE CON `onToken`
// ═══════════════════════════════════════════════════════════════════════════
//
// El widget se pintaba SIEMPRE (`appearance: 'always'`, que es el valor por
// defecto y nunca lo eligió nadie): un recuadro oscuro de 300 px con el logo
// de Cloudflare en la pantalla de acceso del estudio — en un producto de
// marca blanca, debajo del nombre y la foto de la propietaria.
//
// Costó dos intentos fallidos en producción, los dos por la misma confusión:
// `appearance` (cuándo se VE) y `execution` (cuándo CORRE) son parámetros
// distintos, y el que manda es el segundo.
//
// 1. `appearance: 'interaction-only'` a secas **rompió el acceso entero**: con
//    `execution` en su valor por defecto (`'render'`) el desafío corría al
//    pintar, pero el contrato de entonces era pasivo —el formulario esperaba
//    un token para habilitar el botón— y nunca llegaba. Medido: `getResponse()`
//    vacía 8 segundos después de cargar. Las SEIS pantallas sin poder enviar.
// 2. `appearance: 'execute'` a secas devolvió el acceso, pero **el recuadro
//    seguía puesto**: sin `execution: 'execute'` el desafío arranca solo al
//    renderizar, así que el widget se pinta enseguida con su «Verificando…».
//
// La combinación que sí lo deja invisible está MEDIDA en producción contra la
// site key real (2026-08-10), no deducida del manual:
//
//   reposo          → 0 px, sin token
//   tras execute()  → 0 px, token en ~3,5 s
//
// Por eso hay que pedir el token AL ENVIAR y esperarlo: son segundos reales,
// y el botón tiene que estar en estado de carga mientras tanto.
//
// Eso INVIERTE el contrato: ya no se espera un token para habilitar el botón,
// se pide el token al pulsarlo. Por eso es un hook con `pedirToken()` y no un
// componente que emite hacia fuera — el formulario necesita esperar, no
// reaccionar.

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: {
        sitekey: string;
        callback: (token: string) => void;
        'expired-callback'?: () => void;
        'error-callback'?: () => void;
        appearance?: 'always' | 'execute' | 'interaction-only';
        /**
         * CUÁNDO corre el desafío. Es un parámetro DISTINTO de `appearance`, y
         * confundirlos es justo lo que dejó el recuadro puesto en producción.
         * `'render'` (el valor por defecto) lo arranca al pintar el widget.
         */
        execution?: 'render' | 'execute';
        size?: 'normal' | 'flexible' | 'compact';
        theme?: 'auto' | 'light' | 'dark';
      }) => string;
      /** Dispara la verificación de un widget montado en modo `execute`. */
      execute: (widgetId: string) => void;
      /** El token ya emitido y sin gastar, o vacío. */
      getResponse: (widgetId: string) => string | undefined;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

export function turnstileConfigurado(): boolean {
  return !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
}

/** El mensaje cuando no se puede verificar. Uno solo para las seis pantallas. */
// «Vuelve a intentarlo» va PRIMERO, y no es un matiz de redacción: con el
// reinicio automático de abajo, el segundo intento suele funcionar sin
// recargar. Mandar a recargar de entrada le haría perder lo escrito a alguien
// que solo necesita volver a pulsar.
export const ERROR_CAPTCHA =
  'No hemos podido comprobar que no eres un robot. Vuelve a intentarlo; si sigue fallando, recarga la página.';

/** Cuánto se espera a Cloudflare antes de rendirse. */
const ESPERA_MS = 30_000;

/** Cuánto se espera a que un widget reconstruido quede montado. Es solo React montándolo: milisegundos. */
const ESPERA_RECONSTRUIR_MS = 3_000;

/**
 * Cuántas veces se reinicia el widget por su cuenta antes de dejar de
 * intentarlo. Acotado a propósito: si Cloudflare está decidido a no dar un
 * token, reiniciar en bucle no lo arregla y sí quema la cuota de la site key.
 * Tres reintentos cubren el caso real (equivocarse de contraseña un par de
 * veces); a partir de ahí el mensaje pide recargar, que sí funciona siempre.
 */
const MAX_REINICIOS = 3;

export function useCaptcha() {
  // El `<div>` donde Cloudflare pinta su widget. Es ESTADO además de ref, y no es
  // un detalle: cuando la pantalla cambia de rama y React desmonta ese `<div>` y
  // monta otro (en `/reservar`, del formulario a «revisa tu correo», dentro de la
  // misma hoja), el widget se quedaba enganchado al que ya no está en el DOM y
  // `execute()` no resolvía NUNCA — a los 30 s, «no eres un robot» (medido con el
  // script real; el botón «volver a enviar» del código no funcionaba). Con el
  // elemento en el estado, el efecto de montaje vuelve a correr y el widget
  // sigue al contenedor nuevo.
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const [contenedor, setContenedor] = useState<HTMLDivElement | null>(null);
  const asignarContenedor = useCallback((el: HTMLDivElement | null) => {
    contenedorRef.current = el;
    setContenedor(el);
  }, []);
  const widgetId = useRef<string | null>(null);
  // Quién espera un token ahora mismo. Solo puede haber uno: el formulario
  // aguarda a `pedirToken()` antes de seguir.
  const esperando = useRef<((t: string | null) => void) | null>(null);
  const reinicios = useRef(0);
  // Sube cada vez que hay que reconstruir un widget muerto: el efecto de montaje
  // depende de él y vuelve a correr.
  const [generacion, setGeneracion] = useState(0);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const resolver = useCallback((t: string | null) => {
    const fn = esperando.current;
    esperando.current = null;
    fn?.(t);
  }, []);

  /**
   * Devuelve el widget a cero tras un intento fallido.
   *
   * ⚠️ Sin esto, un widget que se cae **no se recupera nunca**: Cloudflare lo
   * tumba (`Error: 300031`, «Turnstile Widget seem to have crashed») y a partir
   * de ahí `execute()` no emite ningún token más, así que el segundo intento y
   * todos los siguientes se comen los 30 segundos enteros y fallan. Medido en
   * producción pidiendo tokens seguidos en la misma pestaña; le pasa a
   * cualquiera que se equivoque de contraseña un par de veces.
   *
   * Va también en el TIMEOUT y no solo en `error-callback`, porque en ese caso
   * medido **el `error-callback` nunca se disparó**: el widget se quedó mudo,
   * no dio error. Confiar solo en el callback habría dejado el fallo igual.
   */
  const reiniciar = useCallback(() => {
    if (reinicios.current >= MAX_REINICIOS) return;
    if (!widgetId.current || !window.turnstile) return;
    reinicios.current += 1;
    // Un widget destruido del todo devuelve `false` aquí: no hay nada que
    // devolver a cero. `pedirToken` lo detecta en el siguiente intento y lo
    // reconstruye (ver `reconstruir`).
    reiniciarWidget(window.turnstile, widgetId.current);
  }, []);

  /**
   * Monta un widget NUEVO cuando el anterior ha dejado de existir en el
   * registro de Cloudflare, y devuelve su id (`null` si no llegó a montarse).
   *
   * ⚠️ Sin esto, un widget muerto no se recuperaba nunca y `pedirToken` lanzaba
   * en cada pulsación: en `/reservar`, «Continuar» no hacía nada y no decía por
   * qué (Sentry JAVASCRIPT-NEXTJS-2T). Ver `lib/auth/turnstile-vivo.ts` para
   * cuándo desaparece un widget del registro de Cloudflare. (Que React remonte el
   * `<div>` contenedor es otro caso, y lo cubre el estado `contenedor`.)
   */
  const reconstruir = useCallback(async (): Promise<string | null> => {
    const viejo = widgetId.current;
    widgetId.current = null;
    if (viejo && window.turnstile) {
      try { window.turnstile.remove(viejo); } catch { /* ya no estaba */ }
    }
    // Lo que Cloudflare dejó dentro del contenedor (un iframe huérfano) no lo
    // gestiona React: se limpia antes de pintar el nuevo.
    contenedorRef.current?.replaceChildren();
    reinicios.current = 0;
    setGeneracion((g) => g + 1);
    for (let esperado = 0; esperado < ESPERA_RECONSTRUIR_MS; esperado += 100) {
      await new Promise<void>((seguir) => setTimeout(seguir, 100));
      if (widgetId.current) return widgetId.current;
    }
    return null;
  }, []);

  // ⚠️ NO se depende del `onLoad` del <Script>. Bug real de producción: con
  // `window.turnstile` ya cargado, el estado que desbloqueaba el render se
  // quedaba en `false` y `render()` no se llamaba NUNCA — le pasaba a quien
  // montara esto después del primer render, o sea a toda socia que ve la
  // pantalla de bienvenida (cada dispositivo nuevo). Se sondea el objeto, que
  // es la única señal que no depende de un evento que quizá ya ocurrió.
  //
  // Y NO se usa `turnstile.ready()`: LANZA si el <script> lleva `async`, y
  // `next/script` se lo pone. Al saltar dentro de un efecto se llevaba la
  // pantalla entera al error boundary.
  useEffect(() => {
    if (!siteKey) return;
    let vivo = true;
    let sondeo: ReturnType<typeof setInterval> | null = null;
    const parar = () => { if (sondeo) { clearInterval(sondeo); sondeo = null; } };

    function montar(): boolean {
      if (!vivo || widgetId.current || !window.turnstile || !contenedor) return false;
      widgetId.current = window.turnstile.render(contenedor, {
        sitekey: siteKey!,
        callback: (token) => resolver(token),
        'error-callback': () => { resolver(null); reiniciar(); },
        // Un token caducado no avisa a nadie: la siguiente llamada a
        // `pedirToken` vuelve a ejecutar y saca uno nuevo.
        'expired-callback': () => {},
        // Las DOS son necesarias, y son cosas distintas:
        //   execution: 'execute'    → el desafío no corre hasta `execute()`.
        //   appearance: 'interaction-only' → solo se pinta si hay que resolver
        //                                    algo A MANO.
        // Sin la primera, el desafío arranca al pintar el widget y `appearance`
        // no tiene nada que ocultar: eso es exactamente lo que pasaba con
        // `appearance: 'execute'` a secas.
        execution: 'execute',
        appearance: 'interaction-only',
        // Cuando SÍ toca enseñarlo, que ocupe su hueco en vez de los 300 px
        // fijos que se salían del margen en un móvil estrecho.
        size: 'flexible',
      });
      return true;
    }

    if (!montar()) sondeo = setInterval(() => { if (montar()) parar(); }, 150);
    return () => {
      vivo = false;
      parar();
      // Si el formulario se desmonta mientras espera, se desbloquea con `null`
      // en vez de dejar una promesa colgada para siempre.
      resolver(null);
      if (widgetId.current && window.turnstile) {
        // Un widget ya muerto puede lanzar también al quitarlo, y un cleanup
        // que lanza rompe el desmontaje de la pantalla.
        try { window.turnstile.remove(widgetId.current); } catch { /* ya no estaba */ }
        widgetId.current = null;
      }
    };
  }, [siteKey, resolver, reiniciar, generacion, contenedor]);

  // Un token se gasta al usarlo. Sin esto, el widget emitía uno y no volvía a
  // emitir nunca: el segundo intento de la misma carga fallaba con
  // `captcha_failed (timeout-or-duplicate)`. Ver `lib/auth/captcha-usado.ts`.
  useEffect(() => alGastarCaptcha(() => {
    // Lo llama la capa de auth DESPUÉS de una petición con token, a mitad de la
    // propia petición: si esto lanzara (widget muerto), se llevaría por delante
    // el login o el alta que la disparó. Un widget muerto se reconstruye en el
    // siguiente `pedirToken`, no aquí.
    if (widgetId.current && window.turnstile) reiniciarWidget(window.turnstile, widgetId.current);
  }), []);

  /**
   * Pide un token. Se llama AL ENVIAR, no antes.
   *
   * - `''`    → no hay captcha configurado: no hay nada que mandar.
   * - `token` → verificado.
   * - `null`  → no se pudo (script bloqueado, red cortada, o se agotó la
   *   espera). El formulario debe abortar y decirlo: mandar sin token haría
   *   que Supabase respondiera con un error mucho peor de entender.
   */
  const pedirToken = useCallback(async (): Promise<string | null> => {
    if (!siteKey) return '';
    if (!widgetId.current || !window.turnstile) return null;

    // Si ya hay uno emitido y sin gastar se reutiliza: `execute()` sobre un
    // widget ya resuelto NO vuelve a llamar al callback, así que pedirlo otra
    // vez se quedaría esperando los 30 segundos enteros.
    //
    // Y si el widget ya no existe, se reconstruye AQUÍ y se sigue con el mismo
    // clic: la persona no tiene por qué enterarse (ver `reconstruir`).
    let id: string = widgetId.current;
    let lectura = leerTokenDelWidget(window.turnstile, id);
    if (lectura.estado === 'muerto') {
      const nuevo = await reconstruir();
      if (!nuevo || !window.turnstile) return null;
      id = nuevo;
      lectura = leerTokenDelWidget(window.turnstile, id);
      if (lectura.estado === 'muerto') return null;
    }
    if (lectura.token) return lectura.token;

    return new Promise<string | null>((resolve) => {
      // Agotar la espera casi siempre significa que el widget se ha caído en
      // silencio, así que se reinicia ANTES de devolver el fallo: quien
      // reintente parte de un widget sano en vez de repetir los 30 segundos.
      const temporizador = setTimeout(() => { reiniciar(); resolver(null); }, ESPERA_MS);
      esperando.current = (t) => { clearTimeout(temporizador); resolve(t); };
      if (ejecutarWidget(window.turnstile!, id) === 'muerto') {
        // Murió entre la lectura y el `execute`: se falla ya (con el mensaje de
        // «vuelve a intentarlo») y se deja reconstruido para el siguiente clic.
        clearTimeout(temporizador);
        esperando.current = null;
        void reconstruir();
        resolve(null);
      }
    });
  }, [siteKey, resolver, reiniciar, reconstruir]);

  // El hueco donde el widget se hará visible SI Cloudflare pide resolver algo.
  // En el caso normal no ocupa nada y no se ve.
  const widget = siteKey ? (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
      <div ref={asignarContenedor} />
    </>
  ) : null;

  return { widget, pedirToken };
}

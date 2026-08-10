'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef } from 'react';
import { alGastarCaptcha } from '@/lib/auth/captcha-usado';

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
// ⚠️ El primer intento de quitarlo fue `appearance: 'interaction-only'` y
// **rompió el acceso entero en producción**: en ese modo el widget no emite
// token si no hay interacción, y no hay con qué interactuar porque justamente
// no se pinta. Sin token, las SEIS pantallas dejaban de poder enviar. Medido:
// `getResponse()` vacía 8 segundos después de cargar.
//
// La vía correcta es `appearance: 'execute'`: se monta invisible y no resuelve
// nada hasta que se llama a `turnstile.execute()`. Entonces emite token, y
// solo se hace visible si de verdad hay un desafío que resolver.
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
export const ERROR_CAPTCHA =
  'No hemos podido comprobar que no eres un robot. Recarga la página e inténtalo de nuevo.';

/** Cuánto se espera a Cloudflare antes de rendirse. */
const ESPERA_MS = 30_000;

export function useCaptcha() {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  // Quién espera un token ahora mismo. Solo puede haber uno: el formulario
  // aguarda a `pedirToken()` antes de seguir.
  const esperando = useRef<((t: string | null) => void) | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const resolver = useCallback((t: string | null) => {
    const fn = esperando.current;
    esperando.current = null;
    fn?.(t);
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
      if (!vivo || widgetId.current || !window.turnstile || !contenedorRef.current) return false;
      widgetId.current = window.turnstile.render(contenedorRef.current, {
        sitekey: siteKey!,
        callback: (token) => resolver(token),
        'error-callback': () => resolver(null),
        // Un token caducado no avisa a nadie: la siguiente llamada a
        // `pedirToken` vuelve a ejecutar y saca uno nuevo.
        'expired-callback': () => {},
        appearance: 'execute',
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
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [siteKey, resolver]);

  // Un token se gasta al usarlo. Sin esto, el widget emitía uno y no volvía a
  // emitir nunca: el segundo intento de la misma carga fallaba con
  // `captcha_failed (timeout-or-duplicate)`. Ver `lib/auth/captcha-usado.ts`.
  useEffect(() => alGastarCaptcha(() => {
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
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
    const ya = window.turnstile.getResponse(widgetId.current);
    if (ya) return ya;

    return new Promise<string | null>((resolve) => {
      const temporizador = setTimeout(() => resolver(null), ESPERA_MS);
      esperando.current = (t) => { clearTimeout(temporizador); resolve(t); };
      window.turnstile!.execute(widgetId.current!);
    });
  }, [siteKey, resolver]);

  // El hueco donde el widget se hará visible SI Cloudflare pide resolver algo.
  // En el caso normal no ocupa nada y no se ve.
  const widget = siteKey ? (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
      <div ref={contenedorRef} />
    </>
  ) : null;

  return { widget, pedirToken };
}

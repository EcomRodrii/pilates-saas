'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { alGastarCaptcha } from '@/lib/auth/captcha-usado';

// Cloudflare Turnstile, sin librería de npm: el embed oficial es un <script>
// global + un div con data-sitekey y un callback — no hace falta envolverlo
// para lo que es, en esencia, leer un token.
//
// Protege alta de estudio (app/crear-estudio), login de equipo (app/login), y
// el portal/alta de socias (app/portal/[slug]/{login,acceso}, app/reservar/[slug]).
// Al principio se dejó fuera el portal de socias ("riesgo bajo", decisión de
// alcance) — pero el captcha se exige a nivel de PROYECTO en Supabase, no por
// pantalla: en cuanto se activó, cualquier login/alta de socia sin token
// empezó a fallar con "captcha protection: request disallowed", dejando a
// las alumnas sin poder entrar al portal. Cubrir solo una parte de las
// pantallas de auth no es una opción real con este modelo de captcha.
//
// Sin NEXT_PUBLIC_TURNSTILE_SITE_KEY el widget no se pinta y `onToken` nunca se
// llama. `turnstileConfigurado()` es lo que usan los formularios para saber si
// deben esperar al token antes de dejar enviar.
//
// ⚠️ OJO, esto NO quiere decir que local/preview funcione «igual que antes».
// El captcha se exige en el PROYECTO de Supabase, no aquí: si está activado,
// gotrue rechaza cualquier alta o login que llegue sin token, venga de donde
// venga. Así que en todo entorno sin la env var —local y las preview de
// Vercel— darse de alta es IMPOSIBLE, y el error que devuelve Supabase es
// «captcha protection: request disallowed (no captcha_token found)».
// Para trabajar en local hay dos salidas: poner la env var (vale la site key
// de prueba de Cloudflare, `1x00000000000000000000AA`), o apagar el captcha
// en Authentication → Settings del proyecto de Supabase.
// El mensaje que ve la usuaria se traduce en `mensajeDeError` (lib/auth-context).
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: {
        sitekey: string;
        callback: (token: string) => void;
        'expired-callback'?: () => void;
        'error-callback'?: () => void;
        /** `interaction-only` = solo se pinta si de verdad hay que interactuar. */
        appearance?: 'always' | 'execute' | 'interaction-only';
        /** `flexible` ocupa el ancho del contenedor en vez de 300 px fijos. */
        size?: 'normal' | 'flexible' | 'compact';
        theme?: 'auto' | 'light' | 'dark';
      }) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

export function turnstileConfigurado(): boolean {
  return !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
}

export function TurnstileWidget({ onToken }: { onToken: (token: string | null) => void }) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  // En un ref para que la suscripción se haga UNA vez: los formularios pasan
  // `setX` de useState, estable, pero alguno podría pasar una función nueva en
  // cada render y resuscribirse (y perder el widget) en bucle.
  const onTokenRef = useRef(onToken);
  // En un efecto, no en el render: escribir un ref durante el render es una
  // violación de las reglas de React (y lo caza el lint). Sin array de
  // dependencias a propósito — tiene que quedarse con la última función.
  useEffect(() => { onTokenRef.current = onToken; });
  // Si el script no carga (bloqueador de contenido, red que corta
  // challenges.cloudflare.com) o el propio widget de Cloudflare nunca resuelve,
  // antes el botón de envío se quedaba deshabilitado PARA SIEMPRE sin ningún
  // aviso: la visitante veía un email válido y un botón muerto, sin saber por
  // qué (bug real, encontrado probando /portal/[slug]/acceso en producción).
  const [fallo, setFallo] = useState(false);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  // Montar el widget: UN solo efecto que espera a que la API exista.
  //
  // ⚠️ Antes eran dos, encadenados por un estado `scriptListo` que ponía el
  // `onLoad` del <Script>. Bug real, encontrado en producción: con
  // `window.turnstile` ya cargado y disponible, ese estado se quedaba en
  // `false` y **`render()` no se llamaba nunca** — ni widget, ni token, botón
  // «Seguir» apagado para siempre y, a los 10 s, el aviso rojo de «no se ha
  // podido cargar». La pantalla de acceso quedaba muerta.
  //
  // Le pasaba a quien monta este componente DESPUÉS del primer render: el
  // <Script> se inyecta con la página ya hidratada y su `onLoad` no vuelve a
  // dispararse si el navegador ya tenía el fichero. En el portal eso no es un
  // caso raro — es toda socia que ve la bienvenida, o sea CADA dispositivo
  // nuevo. Justo la primera vez.
  //
  // ⚠️⚠️ Y NO vale `turnstile.ready()`, que parecía la vía oficial: **LANZA**
  // si el <script> lleva `async`/`defer`, y Next se los pone siempre con
  // `strategy="afterInteractive"`. El mensaje es literal —«Remove async/defer
  // from the api.js script tag before using turnstile.ready()»— y al saltar
  // dentro de un efecto se lleva la pantalla entera al error boundary («Algo
  // se ha roto»). Se probó en producción y fue PEOR que el fallo original.
  //
  // Con el script en modo async la comprobación correcta es la simple: si el
  // objeto existe, la API está lista. Se sondea hasta que aparezca, y el
  // propio efecto renderiza — sin estado intermedio que se pueda desincronizar
  // de la realidad, que es de donde venía todo esto.
  useEffect(() => {
    if (!siteKey) return;
    let vivo = true;
    let sondeo: ReturnType<typeof setInterval> | null = null;
    const parar = () => { if (sondeo) { clearInterval(sondeo); sondeo = null; } };

    function montar(): boolean {
      if (!vivo || widgetId.current || !window.turnstile || !contenedorRef.current) return false;
      widgetId.current = window.turnstile.render(contenedorRef.current, {
        sitekey: siteKey!,
        callback: (token) => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(null),
        'error-callback': () => onTokenRef.current(null),
        // ⚠️ `interaction-only`: el recuadro de Cloudflare SOLO aparece cuando
        // de verdad hay que resolver algo. Antes era `always` —el valor por
        // defecto, nunca elegido—, así que toda visitante veía una caja oscura
        // de 300 px con el logo de otra empresa en la pantalla de acceso de SU
        // estudio, en un producto de marca blanca.
        //
        // No afloja la protección: misma verificación y mismo token, resueltos
        // en silencio. Solo se enseña el widget si la petición le parece
        // sospechosa, que es cuando tiene sentido enseñarlo.
        appearance: 'interaction-only',
        // Y cuando toca enseñarlo, que ocupe el ancho de su hueco en vez de
        // los 300 px fijos que se salían del margen en un móvil estrecho.
        size: 'flexible',
      });
      return true;
    }

    if (!montar()) sondeo = setInterval(() => { if (montar()) parar(); }, 150);
    // El aviso solo si de verdad no se montó: un bloqueador de contenido o una
    // red que corte challenges.cloudflare.com dejaban el botón muerto sin decir
    // por qué.
    const t = setTimeout(() => { if (vivo && !widgetId.current) setFallo(true); }, 10_000);

    return () => {
      vivo = false;
      parar();
      clearTimeout(t);
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [siteKey]);

  // Un token se gasta al usarlo. Sin esto, el widget emitía uno y no volvía a
  // emitir nunca: el segundo intento de la misma carga de página fallaba con
  // `captcha_failed (timeout-or-duplicate)` — un intento por carga, en todas
  // las pantallas de auth. Ver `lib/auth/captcha-usado.ts`.
  useEffect(() => alGastarCaptcha(() => {
    if (!widgetId.current || !window.turnstile) return;
    // Se invalida ANTES de pedir el nuevo: entre el reset y el callback no hay
    // token válido, y dejar el viejo puesto haría que un reintento rápido
    // volviera a mandar el que acaba de gastarse.
    onTokenRef.current(null);
    window.turnstile.reset(widgetId.current);
  }), []);

  if (!siteKey) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        onError={() => setFallo(true)}
      />
      <div ref={contenedorRef} />
      {fallo && (
        <p style={{ fontSize: 12, color: '#B91C1C' }}>
          No se ha podido cargar la verificación de seguridad. Recarga la página e inténtalo de nuevo.{' '}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ fontWeight: 700, textDecoration: 'underline', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            Recargar
          </button>
        </p>
      )}
    </>
  );
}

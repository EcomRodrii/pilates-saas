'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

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
  const [scriptListo, setScriptListo] = useState(false);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!scriptListo || !siteKey || !contenedorRef.current || !window.turnstile) return;
    widgetId.current = window.turnstile.render(contenedorRef.current, {
      sitekey: siteKey,
      callback: (token) => onToken(token),
      'expired-callback': () => onToken(null),
      'error-callback': () => onToken(null),
    });
    return () => {
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptListo, siteKey]);

  if (!siteKey) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        onLoad={() => setScriptListo(true)}
      />
      <div ref={contenedorRef} />
    </>
  );
}

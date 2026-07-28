'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

// Cloudflare Turnstile, sin librería de npm: el embed oficial es un <script>
// global + un div con data-sitekey y un callback — no hace falta envolverlo
// para lo que es, en esencia, leer un token.
//
// Protege alta de estudio (app/crear-estudio) y login de equipo (app/login),
// que es donde vivía la preocupación real: creación masiva de estudios falsos
// o fuerza bruta contra el login. NO cubre el portal de socias (magic link,
// riesgo bajo) a propósito — decisión del usuario, alcance acotado.
//
// Sin NEXT_PUBLIC_TURNSTILE_SITE_KEY configurada, el widget no se pinta y
// `onToken` nunca se llama — el formulario sigue funcionando exactamente
// igual que hoy (sin captcha), así que local/preview sin la env var no se
// rompe. `estaConfigurado()` es lo que usan los formularios para saber si
// deben esperar al token antes de dejar enviar.
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

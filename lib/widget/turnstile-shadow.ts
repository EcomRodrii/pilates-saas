// Cloudflare Turnstile para el bundle embebible (Modo B) — mismo contrato que
// `useCaptcha()` (components/auth/turnstile-widget.tsx: `execution:'execute'`
// + `appearance:'interaction-only'`, token pedido AL ENVIAR, reinicio acotado
// a 3 intentos, se refresca solo al gastarse) pero SIN `next/script`: este
// hook corre fuera del runtime de Next (esbuild), así que el script de
// Cloudflare se inyecta a mano en `document.head` — es un recurso global, no
// puede vivir dentro del Shadow Root, pero el `<div>` donde Turnstile pinta
// su iframe SÍ puede (y debe) estar dentro, para que herede el aislamiento de
// estilos del resto del widget.
//
// ⚠️ Sin medir todavía en este repo: que Turnstile monte y se mantenga
// invisible en reposo dentro de un Shadow Root de un dominio de terceros —
// spike obligatorio antes de dar esto por bueno (docs/auth-widget-diseno.md §9.2).
import { useCallback, useEffect, useRef } from 'react';
import { alGastarCaptcha } from '@/lib/auth/captcha-usado';

const ESPERA_MS = 30_000;
const MAX_REINICIOS = 3;
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

function asegurarScriptTurnstile(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve) => {
    const existente = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existente) {
      if (window.turnstile) { resolve(); return; }
      existente.addEventListener('load', () => resolve(), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.addEventListener('load', () => resolve(), { once: true });
    document.head.appendChild(s);
  });
}

export function useCaptchaWidget(siteKey: string | undefined) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const esperando = useRef<((t: string | null) => void) | null>(null);
  const reinicios = useRef(0);

  const resolver = useCallback((t: string | null) => {
    const fn = esperando.current;
    esperando.current = null;
    fn?.(t);
  }, []);

  const reiniciar = useCallback(() => {
    if (reinicios.current >= MAX_REINICIOS) return;
    if (!widgetId.current || !window.turnstile) return;
    reinicios.current += 1;
    try { window.turnstile.reset(widgetId.current); } catch { /* widget destruido, siguiente intento fallará igual */ }
  }, []);

  useEffect(() => {
    if (!siteKey) return;
    let vivo = true;
    asegurarScriptTurnstile().then(() => {
      if (!vivo || widgetId.current || !window.turnstile || !contenedorRef.current) return;
      widgetId.current = window.turnstile.render(contenedorRef.current, {
        sitekey: siteKey,
        callback: (token) => resolver(token),
        'error-callback': () => { resolver(null); reiniciar(); },
        'expired-callback': () => {},
        execution: 'execute',
        appearance: 'interaction-only',
        size: 'flexible',
      });
    });
    return () => {
      vivo = false;
      resolver(null);
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [siteKey, resolver, reiniciar]);

  useEffect(() => alGastarCaptcha(() => {
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
  }), []);

  const pedirToken = useCallback(async (): Promise<string | null> => {
    if (!siteKey) return '';
    if (!widgetId.current || !window.turnstile) return null;
    const ya = window.turnstile.getResponse(widgetId.current);
    if (ya) return ya;
    return new Promise<string | null>((resolve) => {
      const temporizador = setTimeout(() => { reiniciar(); resolve(null); }, ESPERA_MS);
      esperando.current = (t) => { clearTimeout(temporizador); resolve(t); };
      window.turnstile!.execute(widgetId.current!);
    });
  }, [siteKey, reiniciar]);

  return { contenedorRef, pedirToken };
}

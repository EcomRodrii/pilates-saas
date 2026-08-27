'use client';

// Meta WhatsApp Embedded Signup v4 — el botón "Conectar WhatsApp" que
// sustituye a pegar el token a mano (ver WHATSAPP_AUDIT.md, META_SETUP.md).
// Mismo patrón que components/auth/turnstile-widget.tsx: un hook que carga su
// propio <Script> y expone una función de un solo uso — aquí `conectar()` en
// vez de `pedirToken()`.
//
// Sin NEXT_PUBLIC_META_APP_ID/NEXT_PUBLIC_META_CONFIG_ID no se monta nada
// (`disponible` en false): eso NO desconecta a nadie que ya tenga WhatsApp
// pegado a mano — es solo que el botón nuevo no aparece hasta que alguien
// complete la configuración de META_SETUP.md, y la pantalla cae al flujo
// manual existente (ver tab-integraciones.tsx).

import Script from 'next/script';
import { useCallback, useRef, useState } from 'react';
import { authHeader } from '@/lib/api-client';

declare global {
  interface Window {
    FB?: {
      init: (opts: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } } | null) => void,
        opts: {
          config_id: string;
          response_type: 'code';
          override_default_response_type: true;
          extras: { setup: Record<string, never> };
        },
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID;
const CONFIG_ID = process.env.NEXT_PUBLIC_META_CONFIG_ID;
const API_VERSION = 'v21.0';

export function whatsappEmbeddedSignupConfigurado(): boolean {
  return !!(APP_ID && CONFIG_ID);
}

type ResultadoConexion =
  | { ok: true; verifiedName: string | null; displayPhoneNumber: string | null }
  | { ok: false; error: string };

// Datos informativos que Meta manda por `postMessage` durante el popup — NO
// son de confianza (ver lib/whatsapp.ts::validarConexionEmbeddedSignup, que
// los revalida contra la Graph API real antes de guardar nada). Aquí solo se
// capturan para poder mandarlos junto al `code` al backend.
interface DatosPostMessage {
  wabaId?: string;
  phoneNumberId?: string;
  businessId?: string;
}

export function useWhatsappEmbeddedSignup() {
  const [conectando, setConectando] = useState(false);
  const sdkListo = useRef(false);

  const onScriptLoad = useCallback(() => {
    window.fbAsyncInit = () => {
      if (!APP_ID) return;
      window.FB?.init({ appId: APP_ID, autoLogAppEvents: true, xfbml: true, version: API_VERSION });
      sdkListo.current = true;
    };
    // El SDK llama a `fbAsyncInit` él solo al cargar; si ya estaba cargado
    // (script cacheado, segunda apertura del modal) puede que no lo repita.
    if (window.FB) window.fbAsyncInit();
  }, []);

  /**
   * Abre el popup de Meta, captura el `code` + los IDs informativos del
   * `postMessage`, y los manda al backend para validar/guardar. Un solo
   * intento por llamada — quien llama decide si reintentar.
   */
  const conectar = useCallback((): Promise<ResultadoConexion> => {
    return new Promise((resolve) => {
      if (!APP_ID || !CONFIG_ID) {
        resolve({ ok: false, error: 'Meta no está configurado en este entorno' });
        return;
      }
      if (!window.FB) {
        resolve({ ok: false, error: 'Meta todavía se está cargando. Vuelve a intentarlo en unos segundos.' });
        return;
      }

      let datos: DatosPostMessage = {};
      const onMessage = (event: MessageEvent) => {
        // Meta manda el evento desde su propio dominio — cualquier otro origen
        // se ignora, no se intenta parsear.
        if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return;
        try {
          const payload = JSON.parse(event.data);
          if (payload?.type === 'WA_EMBEDDED_SIGNUP' && payload?.event === 'FINISH') {
            datos = {
              wabaId: payload.data?.waba_id,
              phoneNumberId: payload.data?.phone_number_id,
              businessId: payload.data?.business_id,
            };
          }
        } catch {
          // No era el mensaje que esperábamos — no es un error, solo ruido de
          // otros scripts embebidos en la misma página de Meta.
        }
      };
      window.addEventListener('message', onMessage);

      setConectando(true);
      window.FB.login(
        (response) => {
          window.removeEventListener('message', onMessage);
          (async () => {
            const code = response?.authResponse?.code;
            if (!code) {
              // La propietaria cerró el popup o canceló — no es un error que
              // haya que enseñar en rojo, simplemente no pasó nada.
              setConectando(false);
              resolve({ ok: false, error: '' });
              return;
            }
            if (!datos.wabaId || !datos.phoneNumberId) {
              setConectando(false);
              resolve({ ok: false, error: 'No hemos podido conectar tu WhatsApp. Vuelve a intentarlo.' });
              return;
            }
            try {
              const res = await fetch('/api/integrations/whatsapp/embedded-signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
                body: JSON.stringify({ code, ...datos }),
              });
              const data = (await res.json().catch(() => null)) as
                | { ok: true; verifiedName: string | null; displayPhoneNumber: string | null }
                | { ok: false; error: string }
                | null;
              if (!res.ok || !data || !data.ok) {
                const error = data && !data.ok ? data.error : 'No hemos podido conectar tu WhatsApp. Vuelve a intentarlo.';
                resolve({ ok: false, error });
                return;
              }
              resolve({ ok: true, verifiedName: data.verifiedName, displayPhoneNumber: data.displayPhoneNumber });
            } catch {
              resolve({ ok: false, error: 'No hemos podido conectar tu WhatsApp. Vuelve a intentarlo.' });
            } finally {
              setConectando(false);
            }
          })();
        },
        { config_id: CONFIG_ID, response_type: 'code', override_default_response_type: true, extras: { setup: {} } },
      );
    });
  }, []);

  const script = APP_ID ? (
    <Script src="https://connect.facebook.net/es_ES/sdk.js" strategy="afterInteractive" async defer crossOrigin="anonymous" onLoad={onScriptLoad} />
  ) : null;

  return { script, conectando, conectar, disponible: whatsappEmbeddedSignupConfigurado() };
}

import { useCallback, useEffect } from 'react';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { captchaGastado } from '@/lib/auth/captcha-usado';
import { mensajeSeguro } from '@/lib/errores';
import { postPublicoWidget } from '@/lib/reservar/api-publica';

// Acciones de login/registro del bundle embebible (Modo B) — Fase 2 del
// Booking Engine, ver docs/auth-widget-diseno.md. Separado de
// usar-sesion-widget.ts (que solo lee el estado) porque este hook escribe:
// signInWithPassword/signInWithOtp/alta de socia.
//
// Contraseña es el camino primario (petición directa a gotrue, sin CORS que
// resolver — §2 del diseño). El magic link necesita el puente
// pestaña+postMessage de app/widget-auth-retorno/page.tsx porque
// `detectSessionInUrl` no puede capturar el retorno del email en el DOM de
// un dominio de tercero.

export interface AceptacionWidget {
  fecha: string;
  firma: string;
  versionTexto: string;
}

type ResultadoAuth = { ok: true } | { error: string };

// Exportada aparte porque el formulario necesita abrir esta MISMA URL de
// forma síncrona en el manejador de clic (antes de esperar el token de
// Turnstile, ver el comentario de `enviarEnlace` más abajo) — no puede
// esperar a que `enviarEnlace` termine para saber qué pestaña abrir.
export function urlRetornoWidgetAuth(baseUrl: string, slug: string): string {
  return `${baseUrl}/widget-auth-retorno?slug=${encodeURIComponent(slug)}&origenEstudio=${encodeURIComponent(window.location.origin)}`;
}

export function useAuthWidget(slug: string, baseUrl: string) {
  // Escucha el mensaje que manda app/widget-auth-retorno/page.tsx al
  // completar el magic link. Solo acepta mensajes cuyo origen sea EXACTAMENTE
  // el de Tentare — cualquier otro remitente (incluido código del propio
  // sitio del estudio) se ignora sin más. El token en sí ya viene firmado y
  // verificado por Supabase; este postMessage solo lo transporta.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!baseUrl || e.origin !== baseUrl) return;
      const data = e.data as { tipo?: string; ok?: boolean; access_token?: string; refresh_token?: string } | null;
      if (data?.tipo !== 'tentare-widget-auth' || !data.ok || !data.access_token || !data.refresh_token) return;
      void supabasePortal.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [baseUrl]);

  const loginConPassword = useCallback(async (email: string, password: string, captchaToken?: string): Promise<ResultadoAuth> => {
    const { error } = await supabasePortal.auth.signInWithPassword({ email: email.trim(), password, options: { captchaToken } });
    if (captchaToken) captchaGastado();
    if (!error) return { ok: true };
    const msg = error.message.toLowerCase();
    if (msg.includes('invalid login credentials')) return { error: 'Email o contraseña incorrectos.' };
    if (msg.includes('rate limit') || msg.includes('too many')) return { error: 'Demasiados intentos. Espera un minuto y vuelve a intentarlo.' };
    return { error: mensajeSeguro(error.message, 'No se ha podido iniciar sesión. Inténtalo de nuevo en unos segundos.') };
  }, []);

  // La ventana/pestaña del puente la abre el LLAMADOR (el formulario), de
  // forma síncrona en el propio manejador de clic — antes de esperar el
  // token de Turnstile. Abrirla aquí, después de un `await`, arriesga que el
  // navegador la trate como popup no solicitado y la bloquee (spike
  // pendiente de medir, docs/auth-widget-diseno.md §9.3).
  const enviarEnlace = useCallback(async (email: string, captchaToken?: string): Promise<ResultadoAuth> => {
    const { error } = await supabasePortal.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: urlRetornoWidgetAuth(baseUrl, slug), captchaToken },
    });
    if (captchaToken) captchaGastado();
    return error
      ? { error: mensajeSeguro(error.message, 'No se ha podido enviar el enlace. Inténtalo de nuevo en unos segundos.') }
      : { ok: true };
  }, [slug, baseUrl]);

  // Alta de la walk-in ya autenticada (password o magic link) sin ficha de
  // socia todavía — mismos tres campos que crearAltaWalkIn en
  // app/reservar/[slug]/page.tsx, mismo endpoint (/api/public/socio, ya
  // CORS-aware desde PR #1090).
  const registrar = useCallback(async (studioId: string, nombre: string, telefono: string, aceptacion: AceptacionWidget) => {
    return postPublicoWidget(`${baseUrl}/api/public/socio`, {
      accion: 'registrar',
      studioId,
      id: crypto.randomUUID(),
      nombre: nombre.trim(),
      telefono: telefono.trim(),
      aceptacion,
      referidoPor: null,
      origenLead: null,
    }, { studioId });
  }, [baseUrl]);

  const logout = useCallback(async () => { await supabasePortal.auth.signOut(); }, []);

  return { loginConPassword, enviarEnlace, registrar, logout };
}

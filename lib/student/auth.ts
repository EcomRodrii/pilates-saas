'use client';

import { useCallback } from 'react';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { captchaGastado } from '@/lib/auth/captcha-usado';
import { mensajeSeguro } from '@/lib/errores';

// Acciones de acceso de la alumna, en MISMO ORIGEN.
//
// Prima hermana de `lib/widget/usar-auth-widget.ts`, que hace esto mismo para
// el bundle embebible. No se reutiliza tal cual porque aquel resuelve un
// problema que aquí no existe: al vivir en el dominio del estudio necesita
// `baseUrl` en cada llamada y un puente de pestaña + `postMessage` para el
// enlace mágico, ya que `detectSessionInUrl` no puede capturar el retorno en un
// DOM de tercero. En `/portal/<slug>` estamos en el origen de Tentare y el
// retorno lo recoge el propio cliente.
//
// Lo que SÍ se comparte, y es lo que importa: el mismo `supabasePortal`
// (storageKey 'sb-portal-auth'), así que la sesión de la alumna sigue siendo
// una sola en todo el producto y nunca se mezcla con la del personal.
//
// ⚠️ Turnstile es obligatorio A NIVEL DE PROYECTO en Supabase, no por pantalla:
// sin `captchaToken` gotrue rechaza el login y el enlace mágico. Y su contrato
// está invertido —el token tarda ~3,5 s— así que se pide AL ENVIAR, nunca al
// montar. Ver components/auth/turnstile-widget.tsx.

export type ResultadoAuth = { ok: true } | { error: string };

/** Traducción de los errores de gotrue a algo que una alumna entienda. */
function traducir(mensaje: string, porDefecto: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email o contraseña incorrectos.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos. Espera un minuto y vuelve a intentarlo.';
  if (m.includes('email not confirmed')) return 'Tienes que confirmar tu email antes de entrar. Mira tu correo.';
  if (m.includes('user already registered')) return 'Ya existe una cuenta con ese email. Entra con tu contraseña o pide un enlace.';
  if (m.includes('should be at least') || m.includes('password')) return 'La contraseña es demasiado corta. Usa al menos 8 caracteres.';
  return mensajeSeguro(mensaje, porDefecto);
}

export function useAuthStudent(slug: string) {
  const base = `/portal/${encodeURIComponent(slug)}`;

  const loginConPassword = useCallback(async (email: string, password: string, captchaToken?: string): Promise<ResultadoAuth> => {
    const { error } = await supabasePortal.auth.signInWithPassword({
      email: email.trim(), password, options: { captchaToken },
    });
    // El token de Turnstile es de un solo uso: marcarlo gastado evita que el
    // siguiente intento reutilice uno que gotrue ya ha invalidado.
    if (captchaToken) captchaGastado();
    return error ? { error: traducir(error.message, 'No se ha podido iniciar sesión. Inténtalo de nuevo en unos segundos.') } : { ok: true };
  }, []);

  /**
   * Enlace mágico. Vuelve a `/portal/<slug>/acceso/verificar`, que es donde la
   * alumna elige contraseña si todavía no tiene.
   */
  const enviarEnlace = useCallback(async (email: string, captchaToken?: string): Promise<ResultadoAuth> => {
    const { error } = await supabasePortal.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}${base}/acceso/verificar`, captchaToken },
    });
    if (captchaToken) captchaGastado();
    return error ? { error: traducir(error.message, 'No se ha podido enviar el enlace. Inténtalo de nuevo en unos segundos.') } : { ok: true };
  }, [base]);

  /**
   * Alta con email y contraseña.
   *
   * Crea la identidad en gotrue. La ficha de socia del estudio se crea aparte,
   * con `registrar()`, porque son dos cosas distintas: una persona puede tener
   * cuenta y no ser todavía socia de ESTE estudio.
   */
  const registrarCuenta = useCallback(async (email: string, password: string, captchaToken?: string): Promise<ResultadoAuth> => {
    const { error } = await supabasePortal.auth.signUp({
      email: email.trim(), password,
      options: { emailRedirectTo: `${window.location.origin}${base}/acceso/verificar`, captchaToken },
    });
    if (captchaToken) captchaGastado();
    return error ? { error: traducir(error.message, 'No se ha podido crear la cuenta. Inténtalo de nuevo en unos segundos.') } : { ok: true };
  }, [base]);

  /**
   * Crear o cambiar la contraseña de quien YA tiene sesión.
   *
   * ⚠️ Esta pantalla no existía en ninguna parte del producto. `/reservar`
   * enlazaba a `/portal/<slug>/login` y `/portal/<slug>/acceso`, dos rutas
   * borradas, así que el botón «Crea tu contraseña» devolvía a la misma página
   * desde la que se pulsaba. Con esto, el camino se cierra.
   */
  const fijarPassword = useCallback(async (password: string): Promise<ResultadoAuth> => {
    const { error } = await supabasePortal.auth.updateUser({ password });
    return error ? { error: traducir(error.message, 'No se ha podido guardar la contraseña. Inténtalo de nuevo.') } : { ok: true };
  }, []);

  /** Recuperación: manda el enlace que lleva a elegir contraseña nueva. */
  const recuperar = useCallback(async (email: string, captchaToken?: string): Promise<ResultadoAuth> => {
    const { error } = await supabasePortal.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}${base}/acceso/verificar?crear=1`,
      captchaToken,
    });
    if (captchaToken) captchaGastado();
    return error ? { error: traducir(error.message, 'No se ha podido enviar el enlace. Inténtalo de nuevo en unos segundos.') } : { ok: true };
  }, [base]);

  /**
   * Entrar con Google.
   *
   * El proveedor SÍ está configurado en el proyecto: el personal lo usa contra
   * la MISMA `auth.users` (lib/auth-context.tsx:272). Lo que cambia aquí es el
   * cliente —`supabasePortal`, storageKey 'sb-portal-auth'— para que la sesión
   * caiga en la de la alumna y no en la del personal.
   *
   * El retorno lo recoge el propio cliente porque `supabasePortal` lleva
   * `detectSessionInUrl: true` sin lista blanca de rutas
   * (lib/db/supabase-portal.ts:34), al contrario que el de personal, que solo
   * lo activa en tres rutas. No hay colisión: los módulos de la alumna solo se
   * importan bajo `app/portal/**`, y el personal vuelve a /login,
   * /clave-nueva o /network/acceso.
   *
   * Sin `captchaToken`: `signInWithOAuth` no acepta ese parámetro y gotrue no
   * lo exige en este flujo — el humano lo verifica Google en su pantalla de
   * consentimiento. Mismo criterio que el personal.
   *
   * ⚠️ RIESGO CONOCIDO (HIGH, config de proyecto, no de código): la URL de
   * retorno tiene que estar en la lista de Redirect URLs de Supabase Auth.
   * Hoy están las de personal; `/portal/<slug>/acceso/login` es nueva y hay un
   * slug variable de por medio, así que hace falta un patrón con comodín
   * (comodín en el segmento del slug). Si falta, gotrue rechaza ANTES de redirigir
   * y ese error sí llega aquí — por eso se devuelve traducido en vez de
   * tragarse el fallo.
   */
  const entrarConGoogle = useCallback(async (): Promise<ResultadoAuth> => {
    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}${base}/acceso/login`
      : undefined;
    const { error } = await supabasePortal.auth.signInWithOAuth({
      provider: 'google',
      options: {
        ...(redirectTo ? { redirectTo } : {}),
        // Solo lo mínimo para autenticar: Tentare no llama a ninguna API de
        // Google, así que no hay motivo para pedir más scope.
        scopes: 'openid email profile',
      },
    });
    // Si todo va bien navegamos fuera de la pestaña y nunca llegamos aquí.
    // Solo se alcanza cuando gotrue rechaza antes del redirect: proveedor mal
    // configurado, URL de retorno no permitida o rate limit.
    if (error) return { error: traducir(error.message, 'No hemos podido abrir la entrada con Google.') };
    return { ok: true };
  }, [base]);

  const logout = useCallback(async () => { await supabasePortal.auth.signOut(); }, []);

  return { loginConPassword, enviarEnlace, registrarCuenta, fijarPassword, recuperar, entrarConGoogle, logout };
}

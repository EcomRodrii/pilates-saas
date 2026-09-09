'use client';

import { useCallback } from 'react';
import { codigoDeError, emailYaEnUso, traducirAuth, type CodigoAuth } from './auth-errores.ts';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { invalidarCatalogo } from '@/lib/student/catalogo';
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

export type ResultadoAuth = { ok: true } | { error: string; codigo?: CodigoAuth };


export function useAuthStudent(slug: string) {
  const base = `/portal/${encodeURIComponent(slug)}`;

  const loginConPassword = useCallback(async (email: string, password: string, captchaToken?: string): Promise<ResultadoAuth> => {
    const { error } = await supabasePortal.auth.signInWithPassword({
      email: email.trim(), password, options: { captchaToken },
    });
    // El token de Turnstile es de un solo uso: marcarlo gastado evita que el
    // siguiente intento reutilice uno que gotrue ya ha invalidado.
    if (captchaToken) captchaGastado();
    if (!error) return { ok: true };
    // El código viaja aparte del texto: la pantalla necesita saber QUÉ pasó
    // para ofrecer la salida correcta, y comparar mensajes traducidos sería
    // atarla a la redacción.
    return {
      error: (traducirAuth(error.message) ?? mensajeSeguro(error.message, 'No se ha podido iniciar sesión. Inténtalo de nuevo en unos segundos.')),
      codigo: codigoDeError(error.message),
    };
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
    return error ? { error: (traducirAuth(error.message) ?? mensajeSeguro(error.message, 'No se ha podido enviar el enlace. Inténtalo de nuevo en unos segundos.')) } : { ok: true };
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
    return error ? { error: (traducirAuth(error.message) ?? mensajeSeguro(error.message, 'No se ha podido crear la cuenta. Inténtalo de nuevo en unos segundos.')) } : { ok: true };
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
    return error ? { error: (traducirAuth(error.message) ?? mensajeSeguro(error.message, 'No se ha podido guardar la contraseña. Inténtalo de nuevo.')) } : { ok: true };
  }, []);

  /**
   * Cambiar la contraseña DESDE DENTRO, con la actual por delante.
   *
   * ⚠️ Por qué se pide la actual y no basta con `updateUser({ password })`: el
   * proyecto tiene activado «exigir reautenticación para cambiar la
   * contraseña», y con eso gotrue solo la deja cambiar sin más si la sesión se
   * creó en las últimas 24 horas. En esta app las sesiones duran semanas —es
   * una PWA instalada—, así que el caso NORMAL es el que necesita
   * reautenticación: sin `current_password`, a casi todo el mundo le fallaría.
   *
   * `current_password` es la vía sin correo de por medio. La otra —pedir un
   * código por email con `reauthenticate()`— añade un viaje al buzón para algo
   * que la persona ya sabe.
   *
   * ⚠️ Esto NO afecta a la recuperación: el enlace del correo crea una sesión
   * NUEVA, así que entra de lleno en la ventana de 24 horas y `fijarPassword`
   * sigue funcionando sin pedir nada.
   */
  const cambiarPassword = useCallback(async (actual: string, nueva: string): Promise<ResultadoAuth> => {
    const { error } = await supabasePortal.auth.updateUser({ password: nueva, current_password: actual });
    if (!error) return { ok: true };
    // La contraseña actual equivocada es EL caso frecuente, y el texto crudo de
    // gotrue no lo dice de forma útil. Se distingue para poder señalar el campo
    // correcto en vez de culpar a la nueva.
    const crudo = error.message.toLowerCase();
    if (crudo.includes('current password') || crudo.includes('invalid') || crudo.includes('credentials')) {
      return { error: 'La contraseña actual no es correcta.' };
    }
    return { error: (traducirAuth(error.message) ?? mensajeSeguro(error.message, 'No se ha podido cambiar la contraseña. Inténtalo de nuevo.')) };
  }, []);

  /**
   * Cambiar el email con el que entra.
   *
   * ⚠️ NO cambia al instante, y la pantalla no puede fingir que sí. El proyecto
   * tiene activada la confirmación segura de cambio de email, así que Supabase
   * manda un enlace a la dirección NUEVA (y otro a la vieja) y el cambio no
   * ocurre hasta que se abre. `pendiente` dice exactamente eso: se sabe porque
   * el usuario que devuelve gotrue sigue trayendo el email antiguo.
   *
   * ⚠️ Y NO toca `socios.email`. Escribirlo antes de que el cambio se confirme
   * dejaría la ficha con un email que no corresponde a ninguna sesión real. La
   * realineación la hace el servidor al resolver la sesión, comparando contra
   * el email del JWT — que es el único que está verificado.
   *
   * El id de usuario NO cambia: cambia el email de la identidad, no la
   * identidad. Reservas, bonos, pagos e historial cuelgan de `socios.id`, que
   * a su vez cuelga de `auth_user_id`. Nada de eso se toca.
   */
  const cambiarEmail = useCallback(async (nuevo: string): Promise<ResultadoAuth & { pendiente?: boolean }> => {
    const limpio = nuevo.trim();
    const { data, error } = await supabasePortal.auth.updateUser({ email: limpio });
    if (error) {
      // El caso que el encargo pide cubrir: el email ya es de otra cuenta. El
      // texto lo pone aquí y no `traducirAuth` porque al registrarse el mismo
      // fallo pide otra salida distinta.
      if (emailYaEnUso(error.message)) return { error: 'Ese email ya está en uso en otra cuenta.' };
      return { error: (traducirAuth(error.message) ?? mensajeSeguro(error.message, 'No se ha podido cambiar el email. Inténtalo de nuevo.')) };
    }
    // Si el usuario devuelto sigue con el email viejo, quedó pendiente de que
    // abra el enlace. Es el caso NORMAL con la confirmación segura activada.
    return { ok: true, pendiente: data.user?.email?.toLowerCase() !== limpio.toLowerCase() };
  }, []);

  /** Recuperación: manda el enlace que lleva a elegir contraseña nueva. */
  const recuperar = useCallback(async (email: string, captchaToken?: string): Promise<ResultadoAuth> => {
    const { error } = await supabasePortal.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}${base}/acceso/verificar?crear=1`,
      captchaToken,
    });
    if (captchaToken) captchaGastado();
    return error ? { error: (traducirAuth(error.message) ?? mensajeSeguro(error.message, 'No se ha podido enviar el enlace. Inténtalo de nuevo en unos segundos.')) } : { ok: true };
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
   * ⚠️ VUELVE A `/acceso/verificar`, NO a `/acceso/login`.
   *
   * Volvía a `/acceso/login`, y ahí se moría: el flujo por defecto de auth-js
   * es `implicit`, así que el retorno llega en el fragmento (`#access_token=…`),
   * `detectSessionInUrl` lo consume y guarda la sesión — y la pantalla de login
   * no tiene un solo `useEffect` que mire la sesión. La alumna se autenticaba
   * con Google y volvía al mismo formulario, con toda la pinta de que Google no
   * funciona. Estaba dentro; nada la llevaba adentro.
   *
   * `/acceso/verificar` es la ÚNICA pantalla con lógica de aterrizaje, y ya
   * resuelve los dos casos: si ya es socia, entra; si no lo es, firma el alta
   * con la firma que se recogió ANTES de salir hacia Google.
   *
   * ✅ LA URL DE RETORNO YA ESTÁ PERMITIDA. Este comentario avisaba de lo
   * contrario —«RIESGO CONOCIDO (HIGH)», que hacía falta añadir un comodín para
   * el slug— y era una suposición que nadie había ido a comprobar. Comprobado
   * el 2026-09-09 contra el proyecto real (`GET /v1/projects/<ref>/config/auth`):
   * la lista son cuatro entradas —los dos puertos de localhost y el dominio de
   * producción con y sin `www`— y **las cuatro terminan en `/**`**.
   *
   * Ahí está la clave, y es lo que nadie había mirado: en el emparejador de
   * Supabase `**` casa con cualquier ruta INCLUIDAS las barras (`*` es el que se
   * detiene en los separadores). O sea que la entrada del dominio ya cubre
   * `/portal/<cualquier-slug>/acceso/verificar` sin tocar nada.
   *
   * (Los dominios no se escriben aquí a propósito: `lib/seo/paginas.test.ts`
   * prohíbe el origen a mano en `app`/`components`/`lib` para que haya una sola
   * fuente de verdad — `urlDe()` / `LEGAL.url`. Ese guardia cazó este mismo
   * comentario.)
   *
   * Y no es solo teoría del glob: hay DOS altas con `aceptacion_origen='PORTAL'`
   * (3 y 7 de septiembre de 2026), y esa fila la escribe únicamente
   * `/acceso/verificar` DESPUÉS de volver del enlace mágico o de Google. Si el
   * retorno no estuviera permitido, no existiría ninguna.
   *
   * Lo que sí sigue siendo cierto: si alguien estrecha esa lista, o si la app
   * se sirve algún día desde otro dominio, este flujo se rompe en la vuelta y no
   * en la ida — el síntoma es acabar en el Site URL en vez de en el estudio.
   */
  const entrarConGoogle = useCallback(async (): Promise<ResultadoAuth> => {
    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}${base}/acceso/verificar`
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
    if (error) return { error: (traducirAuth(error.message) ?? mensajeSeguro(error.message, 'No hemos podido abrir la entrada con Google.')) };
    return { ok: true };
  }, [base]);

  // Cinturón además de los tirantes: el catálogo cacheado lleva la `socia` de
  // quien se va; `catalogo.ts` ya se vacía en SIGNED_OUT, pero aquí no cuesta.
  const logout = useCallback(async () => { invalidarCatalogo(slug); await supabasePortal.auth.signOut(); }, [slug]);

  return { loginConPassword, enviarEnlace, registrarCuenta, fijarPassword, cambiarPassword, cambiarEmail, recuperar, entrarConGoogle, logout };
}

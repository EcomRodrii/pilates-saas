'use client';

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { captchaGastado } from './auth/captcha-usado.ts';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { useStudio } from '@/lib/studio-context';
import { mensajeSeguro } from '@/lib/errores';

export interface PortalSession {
  socioId: string;
  nombre: string;
  email: string;
}

interface PortalAuthContextValue {
  session: PortalSession | null;
  /**
   * Vuelve a preguntar quién es. Se usa tras dar de alta a alguien que acaba de
   * entrar y todavía no era socia: la sesión se resolvió a `null` porque no lo
   * era, y ahora sí lo es.
   */
  revalidarSesion: () => Promise<void>;
  isLoading: boolean;
  // I-12 (auditoría 29-ago): true SOLO cuando `session` tenía valor y
  // `resolver()` concluye null SIN que haya sido un `logout()` intencional —
  // es decir, cuando de verdad caducó/se revocó mientras la socia usaba el
  // portal. `PortalShell` lo lee para avisar antes de mandarla a /login en
  // silencio (antes: el estado personal se vaciaba y la socia veía "no
  // tienes nada" sin ninguna pista de qué pasó). Se limpia sola en el
  // siguiente login válido o al cerrar sesión a propósito.
  sesionCaducada: boolean;
  // Envía el magic link / OTP al email. La sesión NO se establece aquí, sino
  // cuando la socia abre el enlace y vuelve al portal (onAuthStateChange).
  // Se usa SOLO para verificar la propiedad del email (primer acceso o
  // recuperación de contraseña) — el día a día se hace con loginConPassword.
  enviarEnlace: (email: string, captchaToken?: string) => Promise<{ ok: true } | { error: string }>;
  /** Entrar con Google. Vuelve a `/acceso?oauth=1`, que es lo que dispara el alta. */
  entrarConGoogle: () => Promise<{ ok: true } | { error: string }>;
  // Login del día a día. Requiere que la socia ya haya creado su contraseña
  // (vía el flujo de enviarEnlace → establecerPassword).
  loginConPassword: (email: string, password: string, captchaToken?: string) => Promise<{ ok: true } | { error: string }>;
  // Establece/cambia la contraseña de la sesión YA autenticada (por magic
  // link). Solo tiene efecto si hay una sesión de Supabase activa.
  establecerPassword: (password: string) => Promise<{ ok: true } | { error: string }>;
  logout: () => Promise<void>;
}

const PortalAuthContext = createContext<PortalAuthContextValue | null>(null);

// El resto de la app aún identifica a la socia leyendo esta clave
// (api-client.leerSociaLocal → studio-context.cargarPublico). En este paso la
// escribimos SOLO tras una sesión de Supabase verificada (antes se escribía con
// solo teclear un email). El paso 2c la sustituirá por el Bearer del JWT.
const LEGACY_KEY = 'ps_portal_session';

export function PortalAuthProvider({ slug, children }: { slug: string; children: React.ReactNode }) {
  const [session, setSession] = useState<PortalSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sesionCaducada, setSesionCaducada] = useState(false);

  // recargarPublico cambia de identidad en cada render (el contexto no memoiza);
  // lo guardamos en un ref para llamarlo sin meterlo en dependencias del efecto.
  // La asignación va en un efecto, no en el cuerpo del render: escribir un ref
  // mientras se renderiza rompe si React descarta ese render (lo que hace de
  // continuo al ajustar estado en render, que es justo lo que hace el resto de
  // este repo desde #708). El `useRef(...)` inicial ya deja el primer valor
  // puesto, y `recargarRef.current` solo se lee dentro de callbacks asíncronos
  // muy posteriores al montaje — nunca antes de que el efecto haya corrido.
  const { recargarPublico } = useStudio();
  const recargarRef = useRef(recargarPublico);
  useEffect(() => { recargarRef.current = recargarPublico; }, [recargarPublico]);

  // I-12: última sesión conocida, para distinguir "nunca hubo sesión" (carga
  // inicial, nada que avisar) de "la había y ahora no" (caducidad real). Y un
  // flag para el único caso en que perder la sesión es intencional (logout),
  // donde tampoco hay que avisar de "caducó".
  const sessionRef = useRef<PortalSession | null>(null);
  useEffect(() => { sessionRef.current = session; }, [session]);
  const logoutIntencionalRef = useRef(false);

  const resolver = useCallback(async () => {
    const concluirSinSesion = () => {
      if (sessionRef.current && !logoutIntencionalRef.current) setSesionCaducada(true);
      logoutIntencionalRef.current = false;
      setSession(null);
      try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
      setIsLoading(false);
    };
    const { data: { session: sb } } = await supabasePortal.auth.getSession();
    if (!sb?.access_token) {
      concluirSinSesion();
      return;
    }
    try {
      const res = await fetch('/api/public/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sb.access_token}` },
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) {
        // Autenticada en Supabase pero su email no es socia de este estudio.
        concluirSinSesion();
        return;
      }
      const data = await res.json() as PortalSession;
      setSesionCaducada(false);
      setSession(data);
      try { localStorage.setItem(LEGACY_KEY, JSON.stringify(data)); } catch { /* ignore */ }
      setIsLoading(false);
      recargarRef.current?.();
    } catch {
      setSession(null);
      setIsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Se suscribe a onAuthStateChange de Supabase. Sincronización con un sistema externo, que es para lo que existen los efectos.
    resolver(); // carga inicial (sesión ya existente o retorno del magic link)
    const { data: sub } = supabasePortal.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        resolver();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [resolver]);

  const enviarEnlace = useCallback(async (email: string, captchaToken?: string): Promise<{ ok: true } | { error: string }> => {
    const { error } = await supabasePortal.auth.signInWithOtp({
      email: email.trim(),
      // Vuelve a la pantalla de crear/restablecer contraseña, NUNCA directo al
      // home: el magic link solo prueba que la socia controla el email.
      options: { emailRedirectTo: `${window.location.origin}/portal/${slug}/clave-nueva`, captchaToken },
    });
    if (captchaToken) captchaGastado();
    // Supabase a veces devuelve un `message` que no es texto para una persona
    // (p. ej. un `{}` en crudo cuando el token de captcha ha caducado entre
    // verificarlo y enviar) — mismo filtro que ya usa el resto del panel.
    return error ? { error: mensajeSeguro(error.message, 'No se ha podido enviar el enlace. Inténtalo de nuevo en unos segundos.') } : { ok: true };
  }, [slug]);

  /**
   * Entrar con Google.
   *
   * ⚠️ Vuelve a `/acceso?oauth=1`, NO al home. Ese parámetro es lo que dispara
   * el alta: quien entra con Google y todavía no es socia de ESTE estudio se da
   * de alta sola (decisión de producto explícita del fundador). Volver directo
   * al home dejaría a esa persona autenticada y sin ficha — el estado «sesión
   * sin socia» que ya costó el bug de «Mis datos».
   *
   * Sin captcha: en OAuth la prueba de que hay una persona la hace Google en su
   * propia pantalla. Turnstile se exige en las vías de email, que son las que
   * un robot puede intentar en bucle.
   */
  const entrarConGoogle = useCallback(async (): Promise<{ ok: true } | { error: string }> => {
    const { error } = await supabasePortal.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/portal/${slug}/acceso?oauth=1` },
    });
    return error
      ? { error: mensajeSeguro(error.message, 'No se ha podido abrir el acceso con Google.') }
      : { ok: true };
  }, [slug]);

  const loginConPassword = useCallback(async (email: string, password: string, captchaToken?: string): Promise<{ ok: true } | { error: string }> => {
    const { error } = await supabasePortal.auth.signInWithPassword({ email: email.trim(), password, options: { captchaToken } });
    if (captchaToken) captchaGastado();
    if (!error) return { ok: true };
    const msg = error.message.toLowerCase();
    if (msg.includes('invalid login credentials')) return { error: 'Email o contraseña incorrectos.' };
    if (msg.includes('rate limit') || msg.includes('too many')) return { error: 'Demasiados intentos. Espera un minuto y vuelve a intentarlo.' };
    return { error: mensajeSeguro(error.message, 'No se ha podido iniciar sesión. Inténtalo de nuevo en unos segundos.') };
  }, []);

  // Requiere una sesión de Supabase ya autenticada (por magic link). No sirve
  // para "cambiar" la contraseña sin más: la prueba de identidad ya ocurrió
  // al verificar el enlace, esto solo fija el nuevo valor sobre esa sesión.
  const establecerPassword = useCallback(async (password: string): Promise<{ ok: true } | { error: string }> => {
    const { error } = await supabasePortal.auth.updateUser({ password });
    return error ? { error: mensajeSeguro(error.message, 'No se ha podido guardar la contraseña. Inténtalo de nuevo en unos segundos.') } : { ok: true };
  }, []);

  const logout = useCallback(async () => {
    logoutIntencionalRef.current = true;
    setSesionCaducada(false);
    await supabasePortal.auth.signOut();
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
    setSession(null);
  }, []);

  return (
    <PortalAuthContext.Provider value={{ session, isLoading, sesionCaducada, revalidarSesion: resolver, enviarEnlace, entrarConGoogle, loginConPassword, establecerPassword, logout }}>
      {children}
    </PortalAuthContext.Provider>
  );
}

export function usePortalAuth() {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error('usePortalAuth must be used inside PortalAuthProvider');
  return ctx;
}

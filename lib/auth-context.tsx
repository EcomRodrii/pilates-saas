'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { fijarUsuario } from '@/lib/sentry-cliente';
import { supabase } from './db/supabase';
import { setCurrentStudioId } from './supabase-data';

// B0.6: identifica al usuario en Sentry para poder medir el impacto real de cada
// error (antes los issues llegaban sin usuario). Solo el id (un UUID), nunca
// email ni nombre — respeta sendDefaultPii:false de la config de Sentry.
function identificarEnSentry(session: Session | null) {
  fijarUsuario(session?.user ? { id: session.user.id } : null);
}

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string, captchaToken?: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    metadata?: Record<string, unknown>,
    captchaToken?: string,
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  updateProfile: (datos: { nombre: string; apellidos: string }) => Promise<{ error: string | null }>;
  updateEmail: (nuevoEmail: string) => Promise<{ error: string | null; pendiente: boolean }>;
  updatePassword: (actual: string, nueva: string, captchaToken?: string) => Promise<{ error: string | null }>;
  recuperarPassword: (email: string, captchaToken?: string) => Promise<{ error: string | null }>;
  establecerPassword: (nueva: string) => Promise<{ error: string | null }>;
  reenviarConfirmacion: (email: string, captchaToken?: string) => Promise<{ error: string | null }>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      identificarEnSentry(data.session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      identificarEnSentry(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Supabase responde en inglés y con su propia jerga. Lo que llegaba a la
  // pantalla del alta era, literalmente:
  //   «captcha protection: request disallowed (no captcha_token found)»
  //
  // Pasa siempre que el proyecto tiene el captcha activado y el navegador no
  // manda token, que es TODO entorno sin NEXT_PUBLIC_TURNSTILE_SITE_KEY: local
  // y las preview de Vercel. Ahí el alta es directamente imposible — al
  // contrario de lo que dice el comentario de components/auth/turnstile-widget,
  // que da por hecho que sin la variable «el formulario sigue funcionando igual
  // que hoy». No es un fallo que se pueda arreglar desde aquí (hace falta la
  // env var, o apagar el captcha en el proyecto de Supabase), pero al menos que
  // el mensaje diga qué pasa y en el idioma del producto.
  function mensajeDeError(error: { message: string }): string {
    const m = error.message.toLowerCase();
    if (m.includes('captcha')) {
      return 'No se ha podido verificar que no eres un robot. Recarga la página e inténtalo otra vez; si sigue pasando, escríbenos.';
    }
    if (m.includes('invalid login credentials')) return 'Email o contraseña incorrectos';
    if (m.includes('email not confirmed')) {
      return 'Te falta confirmar tu email. Busca nuestro correo (mira también en spam) y pulsa el enlace.';
    }
    if (m.includes('user already registered')) {
      return 'Ya hay una cuenta con ese email. Inicia sesión, o usa «he olvidado mi contraseña».';
    }
    if (m.includes('password')) return 'La contraseña debe tener al menos 8 caracteres.';
    return error.message;
  }

  async function signIn(email: string, password: string, captchaToken?: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email, password,
      ...(captchaToken ? { options: { captchaToken } } : {}),
    });
    if (error) return { error: mensajeDeError(error) };
    return { error: null };
  }

  async function signUp(email: string, password: string, metadata?: Record<string, unknown>, captchaToken?: string) {
    // emailRedirectTo es OBLIGATORIO aquí. Sin él, el enlace de verificación
    // devuelve a la RAÍZ del sitio, y la vinculación de la ficha de instructora
    // (dbReclamarAccesoEquipo) solo se ejecuta en /login → la cuenta quedaba
    // creada y verificada pero SIN vincular: el panel decía "no registrada" y
    // la instructora entraba a una pantalla en blanco, sin estudio asociado.
    // Le pasó a Rosi y a María Soler, y hubo que vincularlas a mano.
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        ...(metadata ? { data: metadata } : {}),
        ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
        ...(captchaToken ? { captchaToken } : {}),
      },
    });
    if (error) return { error: mensajeDeError(error), needsConfirmation: false };
    return { error: null, needsConfirmation: !data.session };
  }

  async function signOut() {
    await supabase.auth.signOut();
    // Multi-tenancy: don't let the next session (anonymous browsing, or a
    // different account signing in on this device) inherit this user's
    // resolved studio id. Empty sentinel = matches no tenant.
    setCurrentStudioId('');
  }

  // Fase 1 del perfil de la propietaria (sin fila en `instructores`, que es
  // el caso normal): nombre/apellidos no tienen columna propia en ningún
  // sitio, así que se guardan en auth.users.user_metadata — cero migración,
  // mismo patrón ya usado en el repo para `pending_studio` (app/login).
  async function updateProfile(datos: { nombre: string; apellidos: string }) {
    const { error } = await supabase.auth.updateUser({ data: { nombre: datos.nombre, apellidos: datos.apellidos } });
    if (error) return { error: error.message };
    return { error: null };
  }

  // No se asume si el proyecto exige confirmación doble del cambio de email:
  // se lee de la propia respuesta de gotrue-js. Si `data.user.email` sigue
  // siendo el antiguo, el cambio quedó pendiente de confirmación (revisa tu
  // bandeja); si ya es el nuevo, se aplicó al instante.
  async function updateEmail(nuevoEmail: string) {
    const { data, error } = await supabase.auth.updateUser({ email: nuevoEmail });
    if (error) return { error: error.message, pendiente: false };
    const pendiente = data.user?.email !== nuevoEmail;
    return { error: null, pendiente };
  }

  // Reautenticación defensiva antes de tocar la contraseña: el proyecto tiene
  // `secure_password_change` desactivado (no lo exige Supabase), así que la
  // propia app comprueba la contraseña actual antes de aceptar la nueva.
  //
  // ⚠️ Esa comprobación es un `signInWithPassword`, o sea una llamada de auth
  // más — y el captcha se exige a nivel de PROYECTO, no por pantalla. Sin
  // `captchaToken` gotrue la rechaza SIEMPRE con `captcha_failed`, así que en
  // cuanto se activó Turnstile cambiar la contraseña dejó de ser posible para
  // todo el mundo. Es exactamente el aviso que ya estaba escrito en
  // `components/auth/turnstile-widget.tsx`: cubrir solo una parte de las
  // pantallas de auth no es una opción con este modelo de captcha.
  async function updatePassword(actual: string, nueva: string, captchaToken?: string) {
    const email = session?.user?.email;
    if (!email) return { error: 'No hay sesión activa.' };
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email, password: actual,
      ...(captchaToken ? { options: { captchaToken } } : {}),
    });
    // Antes CUALQUIER fallo aquí se contaba como "la contraseña actual no es
    // correcta". Con el captcha rechazando la llamada, eso convertía un fallo
    // de configuración en una acusación falsa: escribías tu contraseña buena y
    // la aplicación te decía que estaba mal, una y otra vez.
    if (reauthError) {
      const m = reauthError.message.toLowerCase();
      if (m.includes('invalid login credentials')) {
        return { error: 'La contraseña actual no es correcta.' };
      }
      return { error: mensajeDeError(reauthError) };
    }
    const { error } = await supabase.auth.updateUser({ password: nueva });
    if (error) return { error: mensajeDeError(error) };
    return { error: null };
  }

  // Reenviar el correo de confirmación. El proyecto exige confirmar el email
  // (se activó para cerrar un account-takeover), y `mensajeDeError` ya decía
  // "busca nuestro correo, mira también en spam" — pero si el correo nunca
  // llegó, se borró, o el enlace caducó, no había NADA que hacer desde la
  // aplicación. Un callejón sin salida en la primera pantalla del producto.
  async function reenviarConfirmacion(email: string, captchaToken?: string) {
    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}/login` : undefined;
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: {
        ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
        ...(captchaToken ? { captchaToken } : {}),
      },
    });
    if (error) return { error: mensajeDeError(error) };
    return { error: null };
  }

  // Recuperar la contraseña cuando NO puedes entrar. No existía: `/login` no
  // ofrecía "he olvidado mi contraseña" y `resetPasswordForEmail` no se
  // llamaba desde ningún sitio del código. Una propietaria que olvidase su
  // contraseña se quedaba fuera de su propio negocio, y la única salida era
  // que alguien le mandase el enlace desde el panel de Supabase.
  //
  // `redirectTo` apunta a /clave-nueva, que es la única pantalla que sabe
  // recoger la sesión de recuperación. Sin él, el enlace deja al usuario en la
  // raíz del sitio con el token ya gastado y sin dónde escribir la nueva.
  async function recuperarPassword(email: string, captchaToken?: string) {
    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}/clave-nueva` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      ...(redirectTo ? { redirectTo } : {}),
      ...(captchaToken ? { captchaToken } : {}),
    });
    if (error) return { error: mensajeDeError(error) };
    return { error: null };
  }

  // Fijar la contraseña con la sesión que abre el enlace de recuperación. Aquí
  // NO se reautentica: quien llega ya ha demostrado que controla el correo, y
  // pedirle la contraseña actual sería absurdo — no se la sabe, por eso está
  // aquí.
  async function establecerPassword(nueva: string) {
    const { error } = await supabase.auth.updateUser({ password: nueva });
    if (error) return { error: mensajeDeError(error) };
    return { error: null };
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signIn, signUp, signOut, updateProfile, updateEmail, updatePassword, recuperarPassword, establecerPassword, reenviarConfirmacion }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { fijarUsuario, capturarMensaje } from '@/lib/sentry-cliente';
import { identificar as identificarEnPosthog, resetear as resetearPosthog } from '@/lib/posthog-cliente';
import { supabase } from './db/supabase';
import { captchaGastado } from './auth/captcha-usado.ts';
import { ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { setCurrentStudioId, setJwtCaducadoListener } from './supabase-data';
import { decidirRecuperacionJwt } from './recuperar-sesion.ts';

// A-3: marca de la última recarga por sesión caducada (anti-bucle, ver
// VENTANA_ANTIBUCLE_MS en lib/recuperar-sesion.ts).
const CLAVE_RECARGA_JWT = 'tentare-recarga-jwt';

// A-3, candado de reentrada A NIVEL DE MÓDULO, nunca en la closure del efecto
// (hallazgo de la revisión): el propio refreshSession() emite TOKEN_REFRESHED
// → setSession → el efecto con deps [session] se re-registra con una closure
// NUEVA — un candado dentro de ella nacería abierto en plena recuperación, y
// una consulta tardía del abanico (aún con el token viejo) entraría de nuevo,
// leería la marca anti-bucle recién escrita y acabaría en signOut: el caso que
// A-3 arregla convertido en logout forzado.
let recuperacionJwtEnCurso = false;

// Ampliación 28-ago: el abanico de lecturas del arranque falla casi a la vez
// con el mismo token roto, y cada una llama al listener con SU PROPIO
// `recargable` (solo resolveStudioId lo manda a `true`). Antes, quien ganaba
// el candado de arriba decidía en solitario: si una lectura secundaria
// (`recargable: false`) llegaba una fracción antes que resolveStudioId, la
// recarga real se perdía sin más — el candado se quedaba echado 15s y el
// panel seguía con studio_id vacío. Este acumulador recoge el `recargable` de
// TODAS las llamadas que lleguen mientras la recuperación está en curso
// (tanto la que abre el candado como las que lo encuentran ya cerrado), y la
// decisión final se toma sobre él, no sobre el de quien llegó primero.
let recargablePendienteEnCurso = false;

// B0.6: identifica al usuario en Sentry para poder medir el impacto real de cada
// error (antes los issues llegaban sin usuario). Solo el id (un UUID), nunca
// email ni nombre — respeta sendDefaultPii:false de la config de Sentry.
function identificarEnSentry(session: Session | null) {
  fijarUsuario(session?.user ? { id: session.user.id } : null);
}

// Este contexto es SOLO de personal (propietaria/manager/instructora/
// recepción) — las socias entran por lib/portal-auth.tsx, no por aquí. Mismo
// criterio que identificarEnSentry: solo el id (UUID), nunca email ni nombre.
function identificarEnPosthogSiHaySesion(session: Session | null) {
  if (session?.user) identificarEnPosthog(session.user.id);
  else resetearPosthog();
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
    redirectPath?: string,
  ) => Promise<{ error: string | null; needsConfirmation: boolean; yaRegistrado: boolean }>;
  signOut: () => Promise<void>;
  updateProfile: (datos: { nombre: string; apellidos: string }) => Promise<{ error: string | null }>;
  updateEmail: (nuevoEmail: string) => Promise<{ error: string | null; pendiente: boolean }>;
  updatePassword: (actual: string, nueva: string, captchaToken?: string) => Promise<{ error: string | null }>;
  recuperarPassword: (email: string, captchaToken?: string) => Promise<{ error: string | null }>;
  establecerPassword: (nueva: string) => Promise<{ error: string | null }>;
  reenviarConfirmacion: (email: string, captchaToken?: string) => Promise<{ error: string | null }>;
  verificarOtpSignup: (email: string, token: string) => Promise<{ error: string | null; errorCode: OtpErrorCode | null }>;
  signInWithGoogle: (redirectPath?: string) => Promise<{ error: string | null }>;
  linkGoogle: () => Promise<{ error: string | null }>;
  unlinkGoogle: () => Promise<{ error: string | null }>;
};

export type OtpErrorCode = 'INVALIDO' | 'DEMASIADOS_INTENTOS';

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      identificarEnSentry(data.session);
      identificarEnPosthogSiHaySesion(data.session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      identificarEnSentry(session);
      identificarEnPosthogSiHaySesion(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // A-3 (auditoría 20-ago): recuperación de la sesión cuando una consulta
  // muere con PGRST303 (JWT caducado — pestaña dormida). Antes ese fallo
  // devolvía `[]` a la UI y, si pillaba a resolveStudioId en el arranque, la
  // propietaria veía su estudio entero VACÍO sin explicación. La tabla de
  // decisión (recargar / login / nada) es pura y está testeada en
  // lib/recuperar-sesion.ts. El listener solo se registra CON sesión de staff:
  // una visitante de una página pública jamás acaba en /login por esto.
  useEffect(() => {
    if (!session) {
      setJwtCaducadoListener(null);
      return;
    }
    setJwtCaducadoListener(({ recargable }) => {
      // El candado es de módulo (ver su comentario): sobrevive al re-registro
      // que el propio refreshSession provoca vía TOKEN_REFRESHED → [session].
      if (recargable) recargablePendienteEnCurso = true;
      if (recuperacionJwtEnCurso) return;
      recuperacionJwtEnCurso = true;
      void (async () => {
        let refreshOk = false;
        try {
          const { data, error } = await supabase.auth.refreshSession();
          refreshOk = !error && !!data.session;
        } catch {
          refreshOk = false;
        }
        let ultima: number | null = null;
        try {
          const v = sessionStorage.getItem(CLAVE_RECARGA_JWT);
          const n = v ? Number(v) : NaN;
          ultima = Number.isFinite(n) ? n : null;
        } catch { /* sessionStorage puede no estar (SSR, privacidad) */ }

        const decision = decidirRecuperacionJwt({
          haySesionLocal: true, refreshOk, ultimaRecargaMs: ultima, ahoraMs: Date.now(),
        });

        if (decision === 'recargar') {
          // Se decide sobre el ACUMULADOR, no sobre el `recargable` de quien
          // abrió el candado: cualquier hermano que haya llegado mientras
          // tanto (incluido durante el await de arriba) con `recargable:
          // true` ya lo marcó a `true`, y su recuperación no se puede perder
          // solo porque otra lectura ganó la carrera para abrir el candado.
          if (!recargablePendienteEnCurso) {
            // Sin ningún `recargable` en la ráfaga: la sesión ya está
            // renovada y con eso basta — el siguiente clic o sondeo
            // funciona; recargar borraría lo que la usuaria tenía a medias.
            // Se libera el candado tras un margen para absorber el resto de
            // la ráfaga de fallos hermanos del mismo token viejo.
            setTimeout(() => {
              recuperacionJwtEnCurso = false;
              recargablePendienteEnCurso = false;
            }, 15_000);
            return;
          }
          try { sessionStorage.setItem(CLAVE_RECARGA_JWT, String(Date.now())); } catch { /* íd. */ }
          window.location.reload();
          // Si la recarga no llega a ocurrir (un beforeunload con cambios sin
          // guardar puede cancelarla), el candado no puede quedarse echado
          // para siempre.
          setTimeout(() => {
            recuperacionJwtEnCurso = false;
            recargablePendienteEnCurso = false;
          }, 15_000);
          return;
        }
        if (decision === 'login') {
          // Refresh token muerto (o recarga en bucle): esto SÍ es accionable y
          // se reporta — es la única rama de la recuperación que ve Sentry.
          // Caso residual documentado: una propietaria con sesión de staff
          // navegando su PROPIA página pública puede acabar aquí — raro y
          // desconcertante, pero honesto: su sesión estaba muerta de verdad.
          capturarMensaje('[recuperar-sesion] refresh fallido o bucle: se corta a /login', 'warning', {
            tags: { area: 'auth', tipo: 'sesion-caducada' },
            extra: { refreshOk, ultimaRecargaMs: ultima },
          });
          try { await supabase.auth.signOut(); } catch { /* la sesión ya no vale */ }
          window.location.assign('/login?motivo=sesion-caducada');
          setTimeout(() => {
            recuperacionJwtEnCurso = false;
            recargablePendienteEnCurso = false;
          }, 15_000);
          return;
        }
        recuperacionJwtEnCurso = false;
        recargablePendienteEnCurso = false;
      })();
    });
    return () => setJwtCaducadoListener(null);
  }, [session]);

  // Supabase responde en inglés y con su propia jerga. Lo que llegaba a la
  // pantalla del alta era, literalmente:
  //   «captcha protection: request disallowed (no captcha_token found)»
  //
  // Pasa siempre que el proyecto tiene el captcha activado y el navegador no
  // manda token, que es TODO entorno sin NEXT_PUBLIC_TURNSTILE_SITE_KEY: local
  // y las preview de Vercel. Ahí el alta de equipo es directamente imposible
  // (gotrue rechaza sin token, mire lo que mire la app), y no es un fallo que
  // se pueda arreglar desde aquí: hace falta la env var, o apagar el captcha en
  // el proyecto de Supabase. Al menos que el mensaje diga qué pasa y en el
  // idioma del producto.
  //
  // El texto es el MISMO que el del widget, importado y no copiado: eran dos
  // frases distintas para el mismo fallo, y desde que el widget se reinicia
  // solo, la de aquí seguía mandando a recargar cuando casi siempre basta con
  // volver a pulsar.
  function mensajeDeError(error: { message: string }): string {
    const m = error.message.toLowerCase();
    if (m.includes('captcha')) return ERROR_CAPTCHA;
    if (m.includes('invalid login credentials')) return 'Email o contraseña incorrectos';
    if (m.includes('email not confirmed')) {
      // El texto solo se muestra tal cual donde no hay pantalla de OTP que lo
      // intercepte (comprobado por sustring "confirmar tu email" — ver
      // app/login/page.tsx y app/network/acceso/page.tsx). Ya no dice "pulsa
      // el enlace": desde la migración a OTP no hay ningún enlace que pulsar.
      return 'Te falta confirmar tu email. Busca el código que te mandamos (mira también en spam).';
    }
    if (m.includes('user already registered')) {
      return 'Ya hay una cuenta con ese email. Inicia sesión, o usa «he olvidado mi contraseña».';
    }
    if (m.includes('password')) return 'La contraseña debe tener al menos 6 caracteres.';
    // Fase 9/10: este Google ya es la identidad de OTRA cuenta de Tentare —
    // el caso que linkIdentity rechaza en vez de fusionar en silencio.
    if (m.includes('identity is already linked') || m.includes('already linked to another user')) {
      return 'Esta cuenta de Google ya está conectada a otra cuenta de Tentare.';
    }
    if (m.includes('manual linking is disabled')) {
      return 'Conectar cuentas no está disponible ahora mismo. Prueba de nuevo en unos minutos.';
    }
    if (m.includes('unlink_identity_not_allowed') || m.includes('single identity')) {
      return 'No puedes desconectar tu único método de acceso — añade otro antes de quitar este.';
    }
    if (m.includes('provider is not enabled') || m.includes('unsupported provider')) {
      return 'Iniciar sesión con Google no está disponible ahora mismo.';
    }
    return error.message;
  }

  async function signIn(email: string, password: string, captchaToken?: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email, password,
      ...(captchaToken ? { options: { captchaToken } } : {}),
    });
    if (captchaToken) captchaGastado();
    if (error) return { error: mensajeDeError(error) };
    return { error: null };
  }

  async function signUp(
    email: string, password: string, metadata?: Record<string, unknown>, captchaToken?: string, redirectPath = '/login',
  ) {
    // emailRedirectTo es OBLIGATORIO aquí. Sin él, el enlace de verificación
    // devuelve a la RAÍZ del sitio, y la vinculación de la ficha de instructora
    // (dbReclamarAccesoEquipo) solo se ejecuta en /login → la cuenta quedaba
    // creada y verificada pero SIN vincular: el panel decía "no registrada" y
    // la instructora entraba a una pantalla en blanco, sin estudio asociado.
    // Le pasó a Rosi y a María Soler, y hubo que vincularlas a mano.
    // redirectPath por defecto sigue siendo /login (staff de estudio); el alta
    // de Tentare Network pasa '/network/mi-perfil' porque esa cuenta no tiene
    // ficha de instructora que vincular — /login no sabría qué hacer con ella.
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}${redirectPath}` : undefined;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        ...(metadata ? { data: metadata } : {}),
        ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
        ...(captchaToken ? { captchaToken } : {}),
      },
    });
    if (captchaToken) captchaGastado();
    if (error) return { error: mensajeDeError(error), needsConfirmation: false, yaRegistrado: false };
    // Cuando el email ya tiene una cuenta CONFIRMADA, gotrue no devuelve un
    // error (por diseño, para no dejar enumerar qué emails están registrados):
    // responde 200 con un `user` fantasma e `identities: []`, sin sesión y sin
    // mandar ningún correo. Sin este chequeo, `needsConfirmation` salía `true`
    // igual que en un alta real — la pantalla decía "revisa tu email" y nunca
    // se había enviado nada. Pasó de verdad probando el alta de instructora
    // freelance con un email que ya era propietaria de otro estudio.
    const yaRegistrado = !data.session && Array.isArray(data.user?.identities) && data.user.identities.length === 0;
    return { error: null, needsConfirmation: !data.session && !yaRegistrado, yaRegistrado };
  }

  // Botón único reutilizado en /login (entrar y crear) — Google es solo OTRO
  // proveedor de la misma auth.users, nunca un sistema paralelo. Sin
  // captchaToken a propósito: el "humano" aquí lo verifica Google en su
  // propia pantalla de consentimiento, y signInWithOAuth no acepta ese
  // parámetro (gotrue no lo exige en este flujo).
  //
  // redirectPath tiene que resolver a una de las dos rutas de
  // RUTAS_RETORNO_AUTH_STAFF (lib/db/supabase.ts) — hoy solo /login lee el
  // fragmento de vuelta, así que un valor distinto dejaría la sesión sin
  // detectar. Se deja el parámetro por si algún día /clave-nueva también
  // ofrece Google, pero el caller por defecto usa /login.
  async function signInWithGoogle(redirectPath = '/login') {
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}${redirectPath}` : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        ...(redirectTo ? { redirectTo } : {}),
        // Solo lo mínimo que gotrue recomienda para autenticar — Tentare no
        // llama a ninguna API de Google, así que no hay motivo para pedir
        // más scope del que el propio proveedor ya exige por defecto.
        scopes: 'openid email profile',
      },
    });
    // signInWithOAuth navega fuera de la pestaña si todo va bien: solo
    // llegamos aquí cuando gotrue rechaza la petición ANTES del redirect
    // (proveedor no configurado, rate limit...). Cancelar el popup o que el
    // usuario cierre la pestaña no pasa por aquí — eso vuelve a /login sin
    // sesión y sin error, que ya es el estado inicial de la pantalla.
    if (error) return { error: mensajeDeError(error) };
    return { error: null };
  }

  // Vincular Google a la cuenta YA AUTENTICADA (Fase 9 — Seguridad/Cuenta).
  // linkIdentity es la API nativa de Supabase para esto: nunca busca por
  // email ni toca auth.users a mano desde el cliente. Requiere sesión activa
  // — si gotrue detecta que ese Google ya pertenece a OTRA cuenta devuelve
  // un error explícito (mensajeDeError lo traduce), no un merge silencioso.
  async function linkGoogle() {
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/mi-perfil` : undefined;
    const { error } = await supabase.auth.linkIdentity({
      provider: 'google',
      ...(redirectTo ? { options: { redirectTo } } : {}),
    });
    if (error) return { error: mensajeDeError(error) };
    return { error: null };
  }

  // Desvincular Google. Supabase exige que queden al menos DOS identidades
  // para poder desvincular una — si esta es la única, gotrue lo rechaza solo
  // (unlink_identity_not_allowed) y ese es el comportamiento que queremos:
  // nunca dejar a alguien sin forma de volver a entrar.
  async function unlinkGoogle() {
    const { data, error: listError } = await supabase.auth.getUserIdentities();
    if (listError) return { error: mensajeDeError(listError) };
    const identidadGoogle = data?.identities.find(i => i.provider === 'google');
    if (!identidadGoogle) return { error: 'No hay una cuenta de Google conectada.' };
    const { error } = await supabase.auth.unlinkIdentity(identidadGoogle);
    if (error) return { error: mensajeDeError(error) };
    return { error: null };
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
    if (captchaToken) captchaGastado();
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
    if (captchaToken) captchaGastado();
    if (error) return { error: mensajeDeError(error) };
    return { error: null };
  }

  // Verificación de email por OTP de 6 dígitos (sustituye al enlace de
  // confirmación). Pasa por /api/auth/otp/verificar en vez de llamar a
  // `supabase.auth.verifyOtp()` directo: ese endpoint aplica el límite de
  // intentos por email que gotrue no lleva (ver el comentario de esa ruta).
  // Al tener éxito, el servidor devuelve los tokens de la sesión ya creada
  // (gotrue confirma el email y abre sesión en el mismo verifyOtp) y aquí se
  // hidratan con `setSession` — `onAuthStateChange` se dispara solo y
  // `session`/`user` de este contexto quedan al día, sin más código en cada
  // pantalla que use este flujo.
  async function verificarOtpSignup(email: string, token: string) {
    const res = await fetch('/api/auth/otp/verificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token }),
    });
    const data = await res.json().catch(() => null) as
      | { ok: true; session: { access_token: string; refresh_token: string } }
      | { error: string; errorCode: OtpErrorCode }
      | null;
    if (!data || 'error' in data) {
      return { error: data?.error ?? 'No se ha podido verificar el código. Inténtalo de nuevo.', errorCode: data?.errorCode ?? null };
    }
    const { error } = await supabase.auth.setSession(data.session);
    if (error) return { error: mensajeDeError(error), errorCode: null };
    return { error: null, errorCode: null };
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
    if (captchaToken) captchaGastado();
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

  // El value va memoizado (mismo patrón y misma limitación que documenta
  // CoreProvider en core-context.tsx): antes era un literal creado en cada
  // render, así que CUALQUIER render de este provider —que vive en el layout
  // raíz— daba una referencia nueva y re-renderizaba a sus 18 consumidores
  // aunque la sesión no hubiera cambiado. Las funciones se siguen recreando en
  // cada render (no están en useCallback), pero cierran solo sobre `supabase`
  // y setters de estado, que son estables: solo el ESTADO decide cuándo
  // recalcular.
  const value = useMemo(() => ({
    session, user: session?.user ?? null, loading,
    signIn, signUp, signOut, updateProfile, updateEmail, updatePassword,
    recuperarPassword, establecerPassword, reenviarConfirmacion, verificarOtpSignup,
    signInWithGoogle, linkGoogle, unlinkGoogle,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [session, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

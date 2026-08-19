'use client';

// "Dos puertas + login" (1d del rediseño) — la puerta de entrada única de
// Tentare Network. A diferencia de app/login/page.tsx (que también resuelve
// alta de estudio pendiente, reclamo de invitación y alta de instructora
// freelance vía metadata `pending_*`), esta pantalla asume una cuenta YA
// creada y confirmada — es la puerta rápida, no la que termina un alta a
// medias. Si algún día una cuenta con `pending_studio` inicia sesión aquí en
// vez de en /login, ese alta no se completaría — caso de borde aceptado
// conscientemente para no duplicar esa lógica entera; /login sigue siendo
// la puerta completa y esta sigue enlazándola para "Olvidaste tu clave" y
// cualquier caso no cubierto.
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { authHeader } from '@/lib/api-client';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { GoogleIcon } from '@/components/auth/google-icon';
import { OtpVerificacion } from '@/components/auth/otp-verificacion';
import { recordarEmailOtpPendiente, leerEmailOtpPendiente, olvidarEmailOtpPendiente } from '@/lib/auth/otp-pendiente';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { normalizarNombreDeGoogle } from '@/lib/auth/normalizar-nombre-google';
import { ArrowLeftRight } from 'lucide-react';
import { NW_FONDO, NW_TINTA, NW_MUTED, NW_SAGE, NW_VERDE_OSCURO, NW_PRODUCTO, NW_BORDE } from '@/components/network-v2/tokens';

export default function AccesoNetworkPage() {
  const uid = useId();
  const { signIn, signInWithGoogle, session, user, loading, verificarOtpSignup, reenviarConfirmacion, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [conectandoGoogle, setConectandoGoogle] = useState(false);
  const { widget: captcha, pedirToken } = useCaptcha();
  const yaResuelto = useRef(false);
  // Cuenta sin confirmar (alta hecha en /network/crear-perfil o la landing,
  // nunca verificada): en vez de "Te falta confirmar tu email" suelto, se
  // manda a la misma pantalla de código que ven esas dos altas — mismo
  // patrón que app/login/page.tsx.
  const [emailOtp, setEmailOtp] = useState<string | null>(null);
  // Autenticó bien, pero esta identidad no tiene NADA en Network — sí tiene
  // estudio/ficha de Software. Nunca se le concede el autoservicio: se le
  // dice la verdad y se cierra la sesión que se acaba de abrir.
  const [cuentaDeSoftware, setCuentaDeSoftware] = useState(false);
  useEffect(() => {
    const pendiente = leerEmailOtpPendiente();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pendiente) setEmailOtp(pendiente);
  }, []);

  // A diferencia de /login, esta pantalla NUNCA recibe la vuelta de Google
  // directamente: signInWithGoogle() vuelve siempre a /login (su
  // redirectPath por defecto — la única ruta que activa detectSessionInUrl,
  // ver lib/db/supabase.ts), así que un fallo del lado de Google (cancelado,
  // callback caído) se ve y se explica ahí, no aquí. Aquí solo hace falta
  // capturar el error síncrono que gotrue puede devolver ANTES de redirigir
  // (provider mal configurado, rate limit).
  async function conectarConGoogle() {
    setError('');
    setConectandoGoogle(true);
    // '/network/acceso' — el punto de retorno propio de Network (añadido a
    // RUTAS_RETORNO_AUTH_STAFF en lib/db/supabase.ts). Antes esto volvía
    // siempre a /login porque era la única ruta que sabía leer el fragmento
    // de la URL; con dos productos independientes, Network necesita el suyo
    // — si no, cualquier alta/entrada por Google acababa procesada por el
    // efecto de /login, con su propia lógica de pending_studio/invitación.
    const { error } = await signInWithGoogle('/network/acceso');
    if (error) { setError(error); setConectandoGoogle(false); }
  }

  // Misma cola de resolución que /login: destino-post-login es la única
  // fuente de verdad de a dónde pertenece esta cuenta. Hard navigation, no
  // router.replace: mismo motivo que /login (StudioProvider ya resolvió con
  // el studio_id anterior al login).
  //
  // ⚠️ `producto=network` — EL BUG REAL que motivó separar Software/Network
  // (2026-08-19): esta llamada antes NO llevaba `producto`, y la resolución
  // miraba "¿tiene estudio?" ANTES que nada, sin saber que se había entrado
  // por AQUÍ. Una identidad con self-claim (ficha de instructora de Software
  // + perfil de Network) que entrara en esta página para ver sus mensajes de
  // Network acababa SIEMPRE en /dashboard — la puerta por la que entraba
  // dejaba de importar. Con el contexto como parámetro de entrada, cada
  // puerta respeta lo suyo.
  useEffect(() => {
    if (loading || !session || !user || yaResuelto.current) return;
    yaResuelto.current = true;
    (async () => {
      // Ahora este efecto también recibe la vuelta de Google directamente
      // (ver conectarConGoogle) — la normalización de nombre que antes solo
      // corría dentro del efecto de /login tiene que correr aquí también.
      await normalizarNombreDeGoogle(user);

      const resultado = await fetch('/api/auth/destino-post-login?producto=network', { headers: await authHeader() })
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null);

      if (resultado?.tipo === 'cuenta-de-otro-producto') {
        // No se deja una sesión válida abierta enseñando un mensaje de
        // bloqueo: eso es justo el estado ambiguo que se quiere evitar.
        await signOut();
        setCuentaDeSoftware(true);
        return;
      }
      if (resultado?.tipo === 'cuenta-nueva') {
        // Sin estudio y sin perfil de Network: alta por Google recién hecha,
        // sin fila en red_perfiles todavía — se manda a crear el perfil en
        // vez de a un /dashboard que no le pertenece (fallback de siempre).
        window.location.href = '/network/crear-perfil';
        return;
      }
      window.location.href = resultado?.destino ?? '/network/reanudar';
    })();
    // signOut recibido de useAuth() se recrea cada render (no está memoizado);
    // yaResuelto ya evita que el efecto se re-ejecute tras la primera resolución.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, user, loading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const token = await pedirToken();
    if (token === null) { setSubmitting(false); setError(ERROR_CAPTCHA); return; }
    const { error } = await signIn(email, password, token || undefined);
    if (error) {
      if (/confirmar tu email/i.test(error)) {
        recordarEmailOtpPendiente(email.trim());
        setEmailOtp(email.trim());
        setSubmitting(false);
        return;
      }
      setError(error);
      setSubmitting(false);
    }
  }

  if (loading || (session && user)) return null;

  return (
    <div className="min-h-dvh grid lg:grid-cols-[1.04fr_1fr]" style={{ background: NW_FONDO }}>
      <div className="p-10 lg:p-16 flex flex-col justify-center" style={{ background: NW_SAGE }}>
        <div className="max-w-[440px] mx-auto w-full">
          <Link href="/network" className="inline-flex mb-10">
            <LogoTentare formato="horizontal" tinta="tinta" producto="network" titulo="Tentare Network" alto={24} decorativo />
          </Link>
          <h1 className="text-[34px] font-extrabold leading-[1.05] tracking-tight" style={{ color: NW_TINTA }}>
            Entra en <span style={{ color: NW_PRODUCTO }}>Tentare Network</span>
          </h1>
          <p className="mt-2 text-[14.5px]" style={{ color: NW_MUTED }}>
            La red profesional para instructoras y profesionales de Pilates.
          </p>

          <div className="mt-8 space-y-4">
            <div className="bg-white rounded-2xl p-6" style={{ border: `1px solid ${NW_BORDE}` }}>
              <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: NW_MUTED }}>Soy instructora</p>
              <p className="mt-1.5 text-[15px] font-bold" style={{ color: NW_TINTA }}>Quiero que los estudios me encuentren</p>
              <Link
                href="/network/crear-perfil"
                className="inline-block mt-4 px-5 py-2.5 rounded-full text-[13.5px] font-bold text-white"
                style={{ background: NW_PRODUCTO }}
              >
                Crear perfil
              </Link>
              <p className="mt-3 text-[12.5px]" style={{ color: NW_MUTED }}>
                ¿Ya tienes perfil?{' '}
                <a href="#login" className="font-bold underline" style={{ color: NW_TINTA }}>Inicia sesión</a>
              </p>
            </div>

            <div className="rounded-2xl p-6" style={{ background: NW_VERDE_OSCURO }}>
              <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,.6)' }}>Soy propietaria</p>
              <p className="mt-1.5 text-[15px] font-bold text-white">Gestiono un estudio con Tentare</p>
              {/* Enlace al OTRO producto, no un login compartido aquí: Tentare
                  Network y Tentare Software son dos cuentas independientes —
                  una cuenta de estudio no entra por esta puerta. */}
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 mt-4 px-5 py-2.5 rounded-full text-[13.5px] font-bold text-white"
                style={{ border: '1.5px solid rgba(255,255,255,.5)' }}
              >
                Ir a Tentare Software
                <ArrowLeftRight size={13} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div id="login" className="p-10 lg:p-16 flex flex-col justify-center scroll-mt-6">
        <div className="max-w-[380px] mx-auto w-full">
        {cuentaDeSoftware ? (
          <div className="bg-white rounded-2xl p-6 text-center" style={{ border: `1px solid ${NW_BORDE}` }}>
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full" style={{ background: NW_SAGE }}>
              <ArrowLeftRight size={18} style={{ color: NW_PRODUCTO }} aria-hidden="true" />
            </div>
            <p className="text-[16px] font-bold" style={{ color: NW_TINTA }}>Esta cuenta es de Tentare Software</p>
            <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: NW_MUTED }}>
              El email y la contraseña son correctos, pero esta cuenta pertenece a Tentare Software, no a Tentare
              Network — son dos productos independientes. Para tu perfil profesional necesitas una cuenta de
              Network.
            </p>
            <Link
              href="/login"
              className="block w-full mt-5 rounded-xl py-2.5 text-center text-[13.5px] font-bold text-white"
              style={{ background: NW_PRODUCTO }}
            >
              Ir a Tentare Software
            </Link>
            <button
              type="button"
              onClick={() => { setCuentaDeSoftware(false); setEmail(''); setPassword(''); }}
              className="mt-3 text-[13px] font-medium"
              style={{ color: NW_MUTED }}
            >
              Volver a intentarlo con otra cuenta
            </button>
          </div>
        ) : emailOtp ? (
          <OtpVerificacion
            email={emailOtp}
            onVerificar={codigo => verificarOtpSignup(emailOtp, codigo)}
            onReenviar={async () => {
              const token = await pedirToken();
              if (token === null) return { error: ERROR_CAPTCHA };
              return reenviarConfirmacion(emailOtp, token || undefined);
            }}
            onCambiarEmail={() => { olvidarEmailOtpPendiente(); setEmailOtp(null); setError(''); }}
            onVerificado={() => olvidarEmailOtpPendiente()}
            sinTarjeta
          />
        ) : (
        <>
          <p className="text-[20px] font-extrabold" style={{ color: NW_TINTA }}>¿Ya tienes cuenta?</p>

          <button
            type="button"
            disabled={conectandoGoogle}
            onClick={() => void conectarConGoogle()}
            className="w-full mt-6 flex items-center justify-center gap-2.5 py-2.5 rounded-xl text-[13.5px] font-semibold hover:bg-black/[.02] transition-colors disabled:opacity-60"
            style={{ border: `1px solid ${NW_BORDE}`, color: NW_TINTA }}
          >
            <GoogleIcon />
            {conectandoGoogle ? 'Conectando…' : 'Continuar con Google'}
          </button>

          <div className="flex items-center gap-3 my-4">
            <div className="h-px flex-1" style={{ background: NW_BORDE }} />
            <span className="text-[11px] font-medium" style={{ color: NW_MUTED }}>o</span>
            <div className="h-px flex-1" style={{ background: NW_BORDE }} />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor={`${uid}-email`} className="block text-[13px] font-semibold mb-1.5" style={{ color: NW_TINTA }}>Email</label>
              <input
                id={`${uid}-email`} type="email" required value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl text-[14px] outline-none"
                style={{ border: `1px solid ${NW_BORDE}`, color: NW_TINTA }}
              />
            </div>
            <div>
              <label htmlFor={`${uid}-pass`} className="block text-[13px] font-semibold mb-1.5" style={{ color: NW_TINTA }}>Contraseña</label>
              <div className="relative">
                <input
                  id={`${uid}-pass`} type={mostrarPassword ? 'text' : 'password'} required minLength={6}
                  value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 pr-16 rounded-xl text-[14px] outline-none"
                  style={{ border: `1px solid ${NW_BORDE}`, color: NW_TINTA }}
                />
                <button
                  type="button" onClick={() => setMostrarPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold"
                  style={{ color: NW_MUTED }}
                >
                  {mostrarPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>

            {error && <p className="text-[13px] text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}

            {captcha}

            {/* min-h-11 (44px): medido en ≈38px antes (auditoría
                mobile-first) — py-3 solo, sin altura mínima garantizada. */}
            <button
              type="submit" disabled={submitting}
              className="w-full min-h-11 py-3 rounded-full text-[14px] font-bold text-white disabled:opacity-60"
              style={{ background: NW_PRODUCTO }}
            >
              {submitting ? 'Un momento…' : 'Iniciar sesión'}
            </button>
          </form>
          <div className="mt-5 flex flex-col gap-2 text-[13px]" style={{ color: NW_MUTED }}>
            <Link href="/login" className="font-semibold" style={{ color: NW_TINTA }}>¿Has olvidado tu clave?</Link>
          </div>
          <div className="mt-8 rounded-xl p-4 text-[12.5px]" style={{ background: NW_SAGE, color: NW_TINTA }}>
            Esta cuenta es solo de Tentare Network. Si gestionas un estudio, entra en tentare.app.
          </div>
        </>
        )}
        </div>
      </div>
    </div>
  );
}

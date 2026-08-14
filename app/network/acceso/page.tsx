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
import { LogoTentare } from '@/components/marca/logo-tentare';
import { NW_FONDO, NW_TINTA, NW_MUTED, NW_SAGE, NW_VERDE_OSCURO, NW_PRODUCTO, NW_BORDE } from '@/components/network-v2/tokens';

export default function AccesoNetworkPage() {
  const uid = useId();
  const { signIn, session, user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { widget: captcha, pedirToken } = useCaptcha();
  const yaResuelto = useRef(false);

  // Misma cola de resolución que /login: destino-post-login es la única
  // fuente de verdad de a dónde pertenece esta cuenta (estudio real →
  // /dashboard; Network sin estudio → su perfil). Hard navigation, no
  // router.replace: mismo motivo que /login (StudioProvider ya resolvió con
  // el studio_id anterior al login).
  useEffect(() => {
    if (loading || !session || !user || yaResuelto.current) return;
    yaResuelto.current = true;
    (async () => {
      const destino = await fetch('/api/auth/destino-post-login', { headers: await authHeader() })
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null);
      window.location.href = destino?.destino ?? '/dashboard';
    })();
  }, [session, user, loading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const token = await pedirToken();
    if (token === null) { setSubmitting(false); setError(ERROR_CAPTCHA); return; }
    const { error } = await signIn(email, password, token || undefined);
    if (error) { setError(error); setSubmitting(false); }
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
            ¿Cómo entras en <span style={{ color: NW_PRODUCTO }}>Tentare</span>?
          </h1>

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
              <a
                href="#login"
                className="inline-block mt-4 px-5 py-2.5 rounded-full text-[13.5px] font-bold text-white"
                style={{ border: '1.5px solid rgba(255,255,255,.5)' }}
              >
                Entrar en mi estudio
              </a>
            </div>
          </div>
        </div>
      </div>

      <div id="login" className="p-10 lg:p-16 flex flex-col justify-center scroll-mt-6">
        <div className="max-w-[380px] mx-auto w-full">
          <p className="text-[20px] font-extrabold" style={{ color: NW_TINTA }}>¿Ya tienes cuenta?</p>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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

            <button
              type="submit" disabled={submitting}
              className="w-full py-3 rounded-full text-[14px] font-bold text-white disabled:opacity-60"
              style={{ background: NW_PRODUCTO }}
            >
              {submitting ? 'Un momento…' : 'Iniciar sesión'}
            </button>
          </form>
          <div className="mt-5 flex flex-col gap-2 text-[13px]" style={{ color: NW_MUTED }}>
            <Link href="/login" className="font-semibold" style={{ color: NW_TINTA }}>¿Has olvidado tu clave?</Link>
          </div>
          <div className="mt-8 rounded-xl p-4 text-[12.5px]" style={{ background: NW_SAGE, color: NW_TINTA }}>
            Al entrar te llevamos a tu sitio: las instructoras a Tentare Network, las propietarias a su estudio. Nunca al panel equivocado.
          </div>
        </div>
      </div>
    </div>
  );
}

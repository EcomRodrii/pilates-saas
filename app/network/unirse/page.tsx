'use client';

// Alta pública de Tentare Network — cuenta INDEPENDIENTE, sin ningún estudio
// Tentare detrás (a diferencia de app/instructora/alta, que crea un estudio
// de un solo miembro; son dos conceptos de negocio distintos, no reutilizar
// ese flujo aquí aunque el copy se parezca).
//
// Sin metadata `pending_*` ni paso por /login: PUT /api/network/perfil ya
// funciona con solo un JWT válido (verificarUsuarioSupabase, sin studio_id),
// así que al confirmar el email basta con aterrizar en /network/mi-perfil y
// dejar que la persona rellene su perfil ella misma — no hay nada que crear
// automáticamente a partir de la metadata del signup.
import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { useAuth } from '@/lib/auth-context';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';

export default function UnirseNetworkPage() {
  const uid = useId();
  const router = useRouter();
  const { user, loading, signUp } = useAuth();
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { widget: captcha, pedirToken } = useCaptcha();

  // Ya tiene sesión (staff de un estudio, u otra pestaña ya registrada) — a
  // su perfil, no a pedirle que se registre otra vez. Misma fila
  // red_perfiles por auth_user_id si algún día también es staff.
  useEffect(() => {
    if (!loading && user) router.replace('/network/mi-perfil');
  }, [loading, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setSubmitting(true);
    const token = await pedirToken();
    if (token === null) { setSubmitting(false); setError(ERROR_CAPTCHA); return; }

    const { error, needsConfirmation, yaRegistrado } = await signUp(
      email, password,
      { nombre: nombre.trim() },
      token || undefined,
      '/network/mi-perfil',
    );
    if (error) { setError(error); setSubmitting(false); return; }
    if (yaRegistrado) {
      // Mismo criterio que app/login/page.tsx: gotrue no manda nada si el
      // email ya tiene cuenta confirmada, así que "revisa tu email" mentiría.
      setInfo('Ya existe una cuenta con ese email. Inicia sesión — si ya tenías perfil en Network, lo verás tal cual lo dejaste.');
      setSubmitting(false);
      return;
    }
    if (needsConfirmation) {
      setInfo('Cuenta creada. Revisa tu email para confirmarla — al volver, tu perfil ya estará listo para rellenar.');
      setSubmitting(false);
      return;
    }
    window.location.href = '/network/mi-perfil';
  }

  if (loading || user) return null;

  return (
    <div>
      <div className="flex flex-col items-center mb-8">
        <LogoTentare formato="vertical" producto="network" titulo="Tentare Network" alto={92} />
        <p className="text-[14px] text-[#8E8E86] mt-2">La red profesional de instructoras de Pilates</p>
      </div>

      <div className="bg-white rounded-2xl p-6 max-w-sm mx-auto" style={{ border: '1px solid #E7E7E0', boxShadow: '0 30px 60px -30px rgba(26,26,26,.18)' }}>
        <h2 className="text-[16px] font-semibold text-[#1A1A1A] mb-1">Regístrate gratis</h2>
        <p className="text-[13px] text-[#8E8E86] mb-5">
          Publica tu disponibilidad y experiencia. Los estudios te encuentran y te contactan — tú decides con quién hablar.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor={`${uid}-nombre`} className="block text-[13px] font-medium text-[#3A3A34] mb-1.5">Tu nombre</label>
            <input id={`${uid}-nombre`} required value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Ana García"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E7E7E0] text-[14px] text-[#1A1A1A] placeholder:text-[#A8A89F] focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand transition-all" />
          </div>
          <div>
            <label htmlFor={`${uid}-email`} className="block text-[13px] font-medium text-[#3A3A34] mb-1.5">Email</label>
            <input id={`${uid}-email`} type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E7E7E0] text-[14px] text-[#1A1A1A] placeholder:text-[#A8A89F] focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand transition-all" />
          </div>
          <div>
            <label htmlFor={`${uid}-pass`} className="block text-[13px] font-medium text-[#3A3A34] mb-1.5">Contraseña</label>
            <input id={`${uid}-pass`} type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E7E7E0] text-[14px] text-[#1A1A1A] placeholder:text-[#A8A89F] focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand transition-all" />
          </div>

          {error && <p className="text-[13px] text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
          {info && <p className="text-[13px] rounded-lg px-3 py-2" style={{ color: '#22251A', background: '#F1F2EA' }}>{info}</p>}

          {captcha}

          <button type="submit" disabled={submitting}
            className="w-full py-3 rounded-full text-[14px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-60"
            style={{ background: 'var(--brand)', color: 'var(--brand-foreground)', boxShadow: '0 10px 22px color-mix(in srgb, var(--brand) 28%, transparent)' }}>
            {submitting ? 'Un momento…' : 'Crear mi perfil'}
          </button>
        </form>
      </div>

      <p className="text-center text-[12px] text-[#A8A89F] mt-5">
        ¿Ya tienes cuenta de Tentare?{' '}
        <a href="/login" className="font-semibold text-[#3A3A34] hover:underline">Inicia sesión</a>
      </p>
    </div>
  );
}

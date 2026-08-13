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
import { UserCircle2, Search, MessageCircle, ShieldCheck, Mail, BadgeCheck, Clock3 } from 'lucide-react';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { useAuth } from '@/lib/auth-context';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';

const DISCO_NETWORK = '#4F8A5B';

const PASOS = [
  {
    icon: UserCircle2,
    titulo: 'Creas tu perfil',
    texto: 'Especialidad (reformer, mat, máquina, yoga, HIIT), años de experiencia, disponibilidad y tarifa orientativa.',
  },
  {
    icon: Search,
    titulo: 'Los estudios te encuentran',
    texto: 'Buscan por ciudad, especialidad y disponibilidad. No mandas candidaturas a ciegas: te ven cuando encajas.',
  },
  {
    icon: MessageCircle,
    titulo: 'Te contactan y decides tú',
    texto: 'Tu email y teléfono se quedan privados hasta que aceptas la solicitud. Nadie te escribe sin tu permiso.',
  },
] as const;

const CONFIANZA = [
  { icon: Mail, texto: 'Email verificado' },
  { icon: BadgeCheck, texto: 'Experiencia confirmada por el estudio donde trabajaste' },
  { icon: Clock3, texto: 'Actividad reciente, para que se note si sigues buscando' },
] as const;

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
      <div className="flex flex-col items-center text-center mb-10">
        <LogoTentare formato="vertical" producto="network" titulo="Tentare Network" alto={92} />
        <p className="text-[14px] text-[#8E8E86] mt-2 max-w-sm">
          Un perfil profesional para instructoras y profesores de Pilates. Gratis, sin comisión: publicas tu
          disponibilidad, los estudios te encuentran y te contactan directamente.
        </p>
        <a href="#registro"
          className="mt-5 inline-block px-6 py-2.5 rounded-full text-[13px] font-bold text-white transition-all hover:brightness-110"
          style={{ background: 'var(--brand)', color: 'var(--brand-foreground)' }}>
          Crear mi perfil gratis
        </a>
      </div>

      <div className="max-w-sm mx-auto mb-10">
        <h2 className="text-[13px] font-semibold text-[#8E8E86] uppercase tracking-wide mb-4 text-center">Cómo funciona</h2>
        <ol className="space-y-4">
          {PASOS.map((paso, i) => (
            <li key={paso.titulo} className="bg-white rounded-2xl p-4 flex gap-3" style={{ border: '1px solid #E7E7E0' }}>
              <div className="shrink-0 size-9 rounded-full flex items-center justify-center" style={{ background: `color-mix(in srgb, ${DISCO_NETWORK} 14%, white)` }}>
                <paso.icon size={17} style={{ color: DISCO_NETWORK }} />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-[#1A1A1A]">{i + 1}. {paso.titulo}</p>
                <p className="text-[12.5px] text-[#8E8E86] mt-0.5">{paso.texto}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="max-w-sm mx-auto mb-10 bg-white rounded-2xl p-5" style={{ border: '1px solid #E7E7E0' }}>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={16} style={{ color: DISCO_NETWORK }} />
          <h2 className="text-[13px] font-semibold text-[#1A1A1A]">Confianza, no solo un perfil bonito</h2>
        </div>
        <ul className="space-y-2">
          {CONFIANZA.map(item => (
            <li key={item.texto} className="flex items-center gap-2.5 text-[12.5px] text-[#5A5A52]">
              <item.icon size={14} className="shrink-0 text-[#A8A89F]" />
              {item.texto}
            </li>
          ))}
        </ul>
      </div>

      <div id="registro" className="bg-white rounded-2xl p-6 max-w-sm mx-auto scroll-mt-6" style={{ border: '1px solid #E7E7E0', boxShadow: '0 30px 60px -30px rgba(26,26,26,.18)' }}>
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

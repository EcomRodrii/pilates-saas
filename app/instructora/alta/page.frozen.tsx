'use client';

// Alta pública de cuenta FREELANCE (feature #9, ficha Lorari-vs-Tentare):
// instructora sin estudio detrás, publica su horario en /i/[slug] y recibe
// reservas directamente. Decisión de diseño (tentare-arquitecto): "flujo A"
// — ruta nueva, propia, SOLO para freelance. No reactiva el alta pública de
// estudios completos (/crear-estudio sigue en lista de espera) ni reabre esa
// decisión de producto.
//
// Los datos viajan en la metadata del usuario de Auth (`pending_freelance`),
// mismo patrón ya usado por `pending_studio` en app/login/page.tsx — así
// sobreviven al rebote de confirmación de email, que puede abrirse en otro
// dispositivo. El estudio de un solo miembro + la ficha de instructora
// (rol PROPIETARIO) se crean en /login al volver con sesión ya confirmada.

import { useId, useState } from 'react';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { useAuth } from '@/lib/auth-context';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';

export default function AltaInstructoraFreelancePage() {
  const uid = useId();
  const { signUp } = useAuth();
  const [nombre, setNombre] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { widget: captcha, pedirToken } = useCaptcha();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setSubmitting(true);
    const token = await pedirToken();
    if (token === null) { setSubmitting(false); setError(ERROR_CAPTCHA); return; }

    const { error, needsConfirmation, yaRegistrado } = await signUp(
      email, password,
      { pending_freelance: { nombre: nombre.trim(), ciudad: ciudad.trim(), telefono: telefono.trim() } },
      token || undefined,
    );
    if (error) { setError(error); setSubmitting(false); return; }
    if (yaRegistrado) {
      // Email ya registrado y confirmado (p.ej. ya es propietaria de un
      // estudio): no se ha mandado ningún correo, así que decir "revisa tu
      // email" sería mentir. Se dice la verdad — "Iniciar sesión" ya está
      // enlazado justo debajo del formulario.
      setError('Ya existe una cuenta con este email. Inicia sesión en su lugar.');
      setSubmitting(false);
      return;
    }
    if (needsConfirmation) {
      setInfo('Cuenta creada. Revisa tu email para confirmarla — al volver, tu página pública ya estará lista.');
      setSubmitting(false);
      return;
    }
    // Sin confirmación pendiente (proyecto sin verificación de email): ya hay
    // sesión, /login se encarga de crear el estudio+ficha con la metadata.
    window.location.href = '/login';
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4" style={{ background: '#EEEEE8' }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <LogoTentare formato="vertical" alto={76} className="mb-2" />
          <p className="text-[14px] text-[#8E8E86] mt-1">Para instructoras sin estudio</p>
        </div>

        <div className="bg-white rounded-2xl p-6" style={{ border: '1px solid #E7E7E0', boxShadow: '0 30px 60px -30px rgba(26,26,26,.18)' }}>
          <h2 className="text-[16px] font-semibold text-[#1A1A1A] mb-1">Crea tu página de reservas</h2>
          <p className="text-[13px] text-[#8E8E86] mb-5">
            Publica tu horario y recibe reservas directamente, sin estudio detrás.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor={`${uid}-nombre`} className="block text-[13px] font-medium text-[#3A3A34] mb-1.5">Tu nombre</label>
              <input id={`${uid}-nombre`} required value={nombre} onChange={e => setNombre(e.target.value)}
                placeholder="Ana García"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E7E7E0] text-[14px] text-[#1A1A1A] placeholder:text-[#A8A89F] focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand transition-all" />
            </div>
            <div>
              <label htmlFor={`${uid}-ciudad`} className="block text-[13px] font-medium text-[#3A3A34] mb-1.5">Ciudad</label>
              <input id={`${uid}-ciudad`} required value={ciudad} onChange={e => setCiudad(e.target.value)}
                placeholder="Madrid"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E7E7E0] text-[14px] text-[#1A1A1A] placeholder:text-[#A8A89F] focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand transition-all" />
            </div>
            <div>
              <label htmlFor={`${uid}-tel`} className="block text-[13px] font-medium text-[#3A3A34] mb-1.5">Teléfono</label>
              <input id={`${uid}-tel`} type="tel" required value={telefono} onChange={e => setTelefono(e.target.value)}
                placeholder="600 000 000"
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
              {submitting ? 'Un momento…' : 'Crear mi página'}
            </button>
          </form>
        </div>

        <p className="text-center text-[12px] text-[#A8A89F] mt-5">
          ¿Ya tienes cuenta?{' '}
          <a href="/login" className="font-semibold text-[#3A3A34] hover:underline">Iniciar sesión</a>
        </p>
      </div>
    </div>
  );
}

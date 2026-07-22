'use client';

import { useState, useId } from 'react';
import Link from 'next/link';
import { Building2, User, CheckCircle2, Mail } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/db/supabase';
import { dbCreateStudio, setCurrentStudioId } from '@/lib/supabase-data';

type StudioTipo = 'Pilates' | 'Yoga' | 'Fitness' | 'CrossFit' | 'Danza' | 'Otro';

interface StudioForm {
  nombre: string;
  tipo: StudioTipo;
  ciudad: string;
  telefono: string;
}

interface OwnerForm {
  nombreCompleto: string;
  email: string;
  contrasena: string;
}

const TIPOS: StudioTipo[] = ['Pilates', 'Yoga', 'Fitness', 'CrossFit', 'Danza', 'Otro'];

export default function CrearEstudioPage() {
  const uid = useId();
  const { signUp } = useAuth();
  const [step, setStep] = useState(1);
  const [studio, setStudio] = useState<StudioForm>({ nombre: '', tipo: 'Pilates', ciudad: '', telefono: '' });
  const [owner, setOwner] = useState<OwnerForm>({ nombreCompleto: '', email: '', contrasena: '' });
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [needsConfirmEmail, setNeedsConfirmEmail] = useState(false);
  const [nuevoSlug, setNuevoSlug] = useState<string | null>(null);

  function handleStudioSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStep(2);
  }

  async function handleOwnerSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCreating(true);

    const studioFields = { nombre: studio.nombre, ciudad: studio.ciudad, telefono: studio.telefono };

    // Los datos del negocio viajan como metadata del propio usuario de Supabase
    // (no localStorage): así, si confirma el email desde otro dispositivo
    // (ej. abre el enlace en el Gmail del móvil), el estudio se puede crear
    // igual al iniciar sesión por primera vez (ver app/login/page.tsx).
    const { error: signUpError, needsConfirmation } = await signUp(owner.email, owner.contrasena, {
      pending_studio: studioFields,
    });
    if (signUpError) {
      setError(signUpError);
      setCreating(false);
      return;
    }

    if (needsConfirmation) {
      setNeedsConfirmEmail(true);
      setCreating(false);
      return;
    }

    // Ya hay sesión activa (confirmación de email desactivada en el proyecto)
    // — creamos el negocio ahora mismo.
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const newStudio = await dbCreateStudio({ ...studioFields, ownerAuthUserId: user.id });
      if (newStudio) {
        setCurrentStudioId(newStudio.id);
        setNuevoSlug(newStudio.slug);
      }
    }
    setCreating(false);
    setStep(3);
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-1.5 mb-4">
            {[1, 2, 3].map(n => (
              <div
                key={n}
                className="transition-all duration-300"
              >
                <div
                  className={`rounded-full ${
                    n === step
                      ? 'w-6 h-2.5 bg-[#1A1A1A]'
                      : n < step
                      ? 'w-2.5 h-2.5 bg-[#1A1A1A]/50'
                      : 'w-2.5 h-2.5 bg-[#E5E7EB]'
                  }`}
                />
              </div>
            ))}
          </div>
          {step < 3 && (
            <p className="text-[13px] text-[#6B7280]">Paso {step} de 2</p>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-border overflow-hidden">
          {step === 1 && (
            <form onSubmit={handleStudioSubmit} className="p-6 space-y-5">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
                  <Building2 size={20} className="text-[#B57A8E]" />
                </div>
                <div>
                  <h1 className="text-[18px] font-bold text-[#111827] leading-tight">Tu estudio</h1>
                  <p className="text-[13px] text-[#6B7280]">Cuéntanos sobre tu negocio</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label htmlFor={`${uid}-1`} className="block text-[13px] font-medium text-[#374151] mb-1">Nombre del estudio</label>
                  <input id={`${uid}-1`}
                    required
                    type="text"
                    placeholder="Ej. Tentare"
                    value={studio.nombre}
                    onChange={e => setStudio(s => ({ ...s, nombre: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-[14px] text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#1A1A1A] focus:ring-2 focus:ring-[#1A1A1A]/10 transition"
                  />
                </div>

                <div>
                  <label htmlFor={`${uid}-2`} className="block text-[13px] font-medium text-[#374151] mb-1">Tipo de estudio</label>
                  <select id={`${uid}-2`}
                    value={studio.tipo}
                    onChange={e => setStudio(s => ({ ...s, tipo: e.target.value as StudioTipo }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-[14px] text-[#111827] focus:outline-none focus:border-[#1A1A1A] focus:ring-2 focus:ring-[#1A1A1A]/10 transition bg-white"
                  >
                    {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div>
                  <label htmlFor={`${uid}-3`} className="block text-[13px] font-medium text-[#374151] mb-1">Ciudad <span className="font-normal text-[#9CA3AF]">(opcional)</span></label>
                  <input id={`${uid}-3`}
                    type="text"
                    placeholder="Ej. Madrid"
                    value={studio.ciudad}
                    onChange={e => setStudio(s => ({ ...s, ciudad: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-[14px] text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#1A1A1A] focus:ring-2 focus:ring-[#1A1A1A]/10 transition"
                  />
                </div>

                <div>
                  <label htmlFor={`${uid}-4`} className="block text-[13px] font-medium text-[#374151] mb-1">Teléfono <span className="font-normal text-[#9CA3AF]">(opcional)</span></label>
                  <input id={`${uid}-4`}
                    type="tel"
                    placeholder="+34 600 000 000"
                    value={studio.telefono}
                    onChange={e => setStudio(s => ({ ...s, telefono: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-[14px] text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#1A1A1A] focus:ring-2 focus:ring-[#1A1A1A]/10 transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-[#FFC8E2] text-[#171717] font-semibold text-[15px] hover:bg-[#F7B3D2] transition-colors"
              >
                Continuar →
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleOwnerSubmit} className="p-6 space-y-5">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
                  <User size={20} className="text-[#B57A8E]" />
                </div>
                <div>
                  <h1 className="text-[18px] font-bold text-[#111827] leading-tight">Tu cuenta</h1>
                  <p className="text-[13px] text-[#6B7280]">Datos del propietario</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label htmlFor={`${uid}-5`} className="block text-[13px] font-medium text-[#374151] mb-1">Nombre completo</label>
                  <input id={`${uid}-5`}
                    required
                    type="text"
                    placeholder="Ej. María García"
                    value={owner.nombreCompleto}
                    onChange={e => setOwner(o => ({ ...o, nombreCompleto: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-[14px] text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#1A1A1A] focus:ring-2 focus:ring-[#1A1A1A]/10 transition"
                  />
                </div>

                <div>
                  <label htmlFor={`${uid}-6`} className="block text-[13px] font-medium text-[#374151] mb-1">Email</label>
                  <input id={`${uid}-6`}
                    required
                    type="email"
                    placeholder="maria@miestudio.com"
                    value={owner.email}
                    onChange={e => setOwner(o => ({ ...o, email: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-[14px] text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#1A1A1A] focus:ring-2 focus:ring-[#1A1A1A]/10 transition"
                  />
                </div>

                <div>
                  <label htmlFor={`${uid}-7`} className="block text-[13px] font-medium text-[#374151] mb-1">Contraseña</label>
                  <input id={`${uid}-7`}
                    required
                    type="password"
                    placeholder="Mínimo 8 caracteres"
                    value={owner.contrasena}
                    onChange={e => setOwner(o => ({ ...o, contrasena: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-[14px] text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#1A1A1A] focus:ring-2 focus:ring-[#1A1A1A]/10 transition"
                  />
                </div>
              </div>

              {error && (
                <p className="text-[13px] text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 rounded-xl border border-[#E5E7EB] text-[#374151] font-medium text-[15px] hover:bg-[#F9FAFB] transition-colors"
                >
                  ← Atrás
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-[2] py-3 rounded-xl bg-[#FFC8E2] text-[#171717] font-semibold text-[15px] hover:bg-[#F7B3D2] transition-colors disabled:opacity-60"
                >
                  {creating ? 'Creando…' : 'Crear estudio →'}
                </button>
              </div>
            </form>
          )}

          {needsConfirmEmail && (
            <div className="p-6 space-y-4 text-center">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center">
                  <Mail size={32} className="text-[#B57A8E]" />
                </div>
              </div>
              <div>
                <h1 className="text-[18px] font-bold text-[#111827]">Confirma tu email</h1>
                <p className="text-[14px] text-[#6B7280] mt-1">
                  Te hemos enviado un enlace a <strong className="text-[#111827]">{owner.email}</strong>.
                  Confírmalo y luego inicia sesión — tu estudio <strong className="text-[#111827]">{studio.nombre}</strong> se creará automáticamente en ese momento.
                </p>
              </div>
              <Link
                href="/login"
                className="flex items-center justify-center w-full py-3 rounded-xl bg-[#FFC8E2] text-[#171717] font-semibold text-[15px] hover:bg-[#F7B3D2] transition-colors"
              >
                Ir a iniciar sesión →
              </Link>
            </div>
          )}

          {step === 3 && !needsConfirmEmail && (
            <div className="p-6 space-y-5 text-center">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center">
                  <CheckCircle2 size={32} className="text-[#B57A8E]" />
                </div>
              </div>

              <div>
                <h1 className="text-[20px] font-bold text-[#111827]">¡Tu estudio está listo!</h1>
                <p className="text-[14px] text-[#6B7280] mt-1">
                  <strong className="text-[#111827]">{studio.nombre}</strong> ya está configurado.
                  Ahora puedes acceder a tu dashboard o compartir el portal con tus socios.
                </p>
              </div>

              {nuevoSlug && (
                <div className="bg-[#F8F9FA] rounded-xl px-4 py-3 text-left space-y-1">
                  <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#9CA3AF]">URL del portal</p>
                  <p className="text-[13px] font-medium text-[#B57A8E] break-all">
                    {typeof window !== 'undefined' ? window.location.origin : ''}/portal/{nuevoSlug}
                  </p>
                </div>
              )}

              <div className="space-y-2.5">
                {/* Hard navigation on purpose: forces StudioProvider to remount
                    and resolve against the studio we just created, instead of
                    keeping whatever it fetched before dbCreateStudio finished. */}
                <a
                  href="/dashboard"
                  className="flex items-center justify-center w-full py-3.5 rounded-xl bg-[#FFC8E2] text-[#171717] font-semibold text-[15px] hover:bg-[#F7B3D2] transition-colors"
                >
                  Ir al dashboard →
                </a>
                <Link
                  href="/portal/login"
                  className="flex items-center justify-center w-full py-3.5 rounded-xl border border-[#E7E7E0] text-[#1A1A1A] font-semibold text-[15px] hover:bg-[#F5F5F1] transition-colors"
                >
                  Ver portal de miembros →
                </Link>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-[12px] text-[#9CA3AF] mt-4">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="text-[#B57A8E] hover:underline">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}

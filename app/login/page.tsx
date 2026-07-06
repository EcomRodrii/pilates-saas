'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useAuth } from '@/lib/auth-context';
import { useStudio } from '@/lib/studio-context';
import { supabase } from '@/lib/supabase';
import { dbCreateStudio, setCurrentStudioId } from '@/lib/supabase-data';

export default function LoginPage() {
  const { signIn, signUp, session, user, loading } = useAuth();
  const { claimInstructorAccount } = useStudio();
  const [modo, setModo] = useState<'entrar' | 'crear'>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading || !session || !user) return;

    (async () => {
      // Alta pendiente de /crear-estudio (el proyecto exigía confirmar el
      // email antes de tener sesión): crea el negocio real ahora que ya hay
      // sesión. Los datos viajan en la metadata del usuario (no localStorage),
      // así que esto funciona aunque el email se confirme desde otro
      // dispositivo distinto al que hizo el alta.
      const pending = user.user_metadata?.pending_studio as
        | { nombre: string; ciudad: string; telefono: string }
        | undefined;
      if (pending) {
        const newStudioId = await dbCreateStudio({ ...pending, ownerAuthUserId: user.id });
        if (newStudioId) setCurrentStudioId(newStudioId);
        await supabase.auth.updateUser({ data: { pending_studio: null } });
      }
      await claimInstructorAccount(user.email ?? '', user.id);
    })().finally(() => {
      // Hard navigation on purpose: StudioProvider (mounted once at the root
      // layout) already resolved/fetched with whatever studio_id was current
      // *before* the studio creation/claim above finished. A client-side
      // router.replace wouldn't remount it, so the dashboard could briefly
      // show the wrong tenant's data. A full reload guarantees a fresh
      // resolution against the now-final state.
      window.location.href = '/dashboard';
    });
  }, [session, user, loading, claimInstructorAccount]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setSubmitting(true);

    if (modo === 'entrar') {
      const { error } = await signIn(email, password);
      if (error) {
        setError('Email o contraseña incorrectos');
        setSubmitting(false);
      }
      // El redirect + reclamo de cuenta lo hace el useEffect al detectar sesión.
    } else {
      const { error, needsConfirmation } = await signUp(email, password);
      if (error) {
        setError(error);
        setSubmitting(false);
      } else if (needsConfirmation) {
        setInfo('Cuenta creada. Revisa tu email para confirmarla y luego inicia sesión.');
        setModo('entrar');
        setSubmitting(false);
      }
      // Si no requiere confirmación, ya hay sesión y el useEffect se encarga.
    }
  }

  if (loading) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#EEEEE8] px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <Image src="/logo-stacked.png" alt="Tentare" width={140} height={97} className="h-20 w-auto object-contain mb-2" />
          <p className="text-[14px] text-[#8E8E86] mt-1">Panel de gestión</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#E7E7E0] p-6">
          <h2 className="text-[16px] font-semibold text-[#1A1A1A] mb-5">
            {modo === 'entrar' ? 'Iniciar sesión' : 'Crear cuenta de equipo'}
          </h2>

          {modo === 'crear' && (
            <p className="text-[13px] text-[#8E8E86] mb-4 -mt-2">
              Usa el email exacto que te haya dado tu propietaria en Equipo — tu rol quedará vinculado automáticamente al iniciar sesión.
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-[#3A3A34] mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E7E7E0] text-[14px] text-[#1A1A1A] placeholder:text-[#A8A89F] focus:outline-none focus:ring-2 focus:ring-[#1A1A1A]/20 focus:border-[#1A1A1A] transition-all"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#3A3A34] mb-1.5">
                Contraseña
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E7E7E0] text-[14px] text-[#1A1A1A] placeholder:text-[#A8A89F] focus:outline-none focus:ring-2 focus:ring-[#1A1A1A]/20 focus:border-[#1A1A1A] transition-all"
              />
            </div>

            {error && (
              <p className="text-[13px] text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}
            {info && (
              <p className="text-[13px] text-[#B57A8E] bg-[#FFF2F7] rounded-lg px-3 py-2">{info}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-full text-[14px] font-bold text-[#171717] transition-all hover:brightness-95 disabled:opacity-60"
              style={{ backgroundColor: '#FFC8E2' }}
            >
              {submitting ? 'Un momento…' : modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
            </button>
          </form>
        </div>

        <p className="text-center text-[12px] text-[#A8A89F] mt-5">
          {modo === 'entrar' ? (
            <>¿Eres del equipo y aún no tienes cuenta?{' '}
              <button onClick={() => { setModo('crear'); setError(''); setInfo(''); }} className="font-semibold text-[#3A3A34] hover:underline">
                Crear cuenta
              </button>
            </>
          ) : (
            <>¿Ya tienes cuenta?{' '}
              <button onClick={() => { setModo('entrar'); setError(''); setInfo(''); }} className="font-semibold text-[#3A3A34] hover:underline">
                Iniciar sesión
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

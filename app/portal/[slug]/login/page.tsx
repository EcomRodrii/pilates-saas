'use client';

import { useState } from 'react';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { supabase } from '@/lib/supabase';
import { getCurrentStudioId } from '@/lib/supabase-data';
import { Mail, AlertCircle } from 'lucide-react';

export default function PortalLogin() {
  const { login } = usePortalAuth();
  const { studio } = useStudio();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { data, error: dbError } = await supabase
      .from('socios')
      .select('id, nombre, apellidos, email')
      .ilike('email', email.trim())
      .eq('studio_id', getCurrentStudioId())
      .maybeSingle();

    if (dbError || !data) {
      setError(dbError ? `Error DB: ${dbError.message}` : 'Email no encontrado en la base de datos.');
      setLoading(false);
      return;
    }

    login({
      socioId: data.id,
      nombre: `${data.nombre} ${data.apellidos}`,
      email: data.email,
    });
  }

  const inicial = studio?.nombre?.trim()?.[0]?.toUpperCase() ?? 'T';

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Hero con la identidad del estudio */}
      <div
        className="flex-1 flex flex-col justify-end px-6 pb-12 pt-20 min-h-[45vh]"
        style={{ background: 'linear-gradient(160deg, #131313 0%, #1A1A1A 55%, #F7A6C4 100%)' }}
      >
        <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center text-white font-extrabold text-[22px] mb-4">
          {inicial}
        </div>
        <h1 className="text-white text-[26px] font-extrabold tracking-tight leading-tight">
          {studio?.nombre ?? 'Tentare'}
        </h1>
        <p className="text-white/50 text-[13px] mt-1">
          Pilates{studio?.ciudad ? ` · ${studio.ciudad}` : ''}
        </p>
      </div>

      {/* Hoja blanca con el formulario */}
      <div className="relative z-10 -mt-6 bg-white rounded-t-[32px] px-6 pt-8 pb-10">
        <h2 className="text-[22px] font-extrabold text-[#171717] leading-tight">Bienvenida de nuevo</h2>
        <p className="text-[13px] text-[#8E8E86] mt-1 mb-6">Entra para reservar tus clases</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[12px] font-semibold text-[#3A3A34] block mb-1.5">Email</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A8A89E]" />
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                placeholder="tu@email.com"
                required
                autoFocus
                className="w-full pl-10 pr-4 py-3.5 bg-white border border-[#E7E7E0] rounded-2xl text-sm text-[#171717] placeholder:text-[#A8A89E] outline-none focus:border-[#1A1A1A] focus:ring-2 focus:ring-[#1A1A1A]/10 transition-all"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-[#B91C1C] bg-[#FEE2E2] rounded-xl p-3">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email}
            className="w-full py-3.5 rounded-2xl bg-[#FFC8E2] text-[#171717] font-bold text-sm transition-all disabled:opacity-50 hover:bg-[#F7B3D2] active:scale-[0.98]"
          >
            {loading ? 'Comprobando...' : 'Entrar'}
          </button>
        </form>

        <p className="mt-6 text-xs text-[#A8A89E] text-center">
          ¿Eres nueva? Habla con tu instructora para que te añada como socia y puedas acceder.
        </p>
      </div>
    </div>
  );
}

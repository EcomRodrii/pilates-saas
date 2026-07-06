'use client';

import { useState } from 'react';
import Image from 'next/image';
import { usePortalAuth } from '@/lib/portal-auth';
import { supabase } from '@/lib/supabase';
import { getCurrentStudioId } from '@/lib/supabase-data';
import { Mail, AlertCircle } from 'lucide-react';

export default function PortalLogin() {
  const { login } = usePortalAuth();
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

  return (
    <div className="min-h-screen bg-[#EEEEE8] flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="mb-10 flex flex-col items-center gap-4">
        <Image src="/logo-stacked.png" alt="Tentare" width={160} height={110} className="h-24 w-auto object-contain" />
        <div className="text-center">
          <h1 className="text-2xl font-extrabold text-[#171717]">Portal de miembros</h1>
          <p className="text-sm text-[#8E8E86] mt-1">Accede con tu email</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
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

      <p className="mt-8 text-xs text-[#A8A89E] text-center max-w-xs">
        ¿Eres nuevo? Habla con tu instructor para que te añada como miembro y puedas acceder.
      </p>
    </div>
  );
}

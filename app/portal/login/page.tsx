'use client';

import { useState } from 'react';
import { usePortalAuth } from '@/lib/portal-auth';
import { supabase } from '@/lib/supabase';
import { Mail, Dumbbell, AlertCircle } from 'lucide-react';

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
      .eq('studio_id', 'studio-1')
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
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="mb-10 flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-[#4F46E5] flex items-center justify-center shadow-lg">
          <Dumbbell size={28} className="text-white" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-extrabold text-[#111827]">Portal de miembros</h1>
          <p className="text-sm text-[#6B7280] mt-1">Accede con tu email</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div className="relative">
          <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
          <input
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(''); }}
            placeholder="tu@email.com"
            required
            autoFocus
            className="w-full pl-10 pr-4 py-3.5 bg-white border border-[#E8EAED] rounded-2xl text-sm text-[#111827] placeholder:text-[#9CA3AF] outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20 transition-all"
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
          className="w-full py-3.5 rounded-2xl bg-[#4F46E5] text-white font-bold text-sm transition-all disabled:opacity-50 hover:bg-[#4338CA] active:scale-[0.98]"
        >
          {loading ? 'Comprobando...' : 'Entrar'}
        </button>
      </form>

      <p className="mt-8 text-xs text-[#9CA3AF] text-center max-w-xs">
        ¿Eres nuevo? Habla con tu instructor para que te añada como miembro y puedas acceder.
      </p>
    </div>
  );
}

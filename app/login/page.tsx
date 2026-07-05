'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const { signIn, session, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) router.replace('/dashboard');
  }, [session, loading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const { error } = await signIn(email, password);
    if (error) {
      setError('Email o contraseña incorrectos');
      setSubmitting(false);
    } else {
      router.replace('/dashboard');
    }
  }

  if (loading) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FDFBFA] px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <Image src="/logo-transparent.png" alt="Tentare" width={140} height={60} className="h-16 w-auto object-contain mb-2" />
          <p className="text-[14px] text-[#8B7D82] mt-1">Panel de gestión</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#F0E6E4] p-6">
          <h2 className="text-[16px] font-semibold text-[#2B2429] mb-5">Iniciar sesión</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-[#4A3F44] mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E6E4] text-[14px] text-[#2B2429] placeholder:text-[#B0A3A8] focus:outline-none focus:ring-2 focus:ring-[#2B2429]/20 focus:border-[#2B2429] transition-all"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#4A3F44] mb-1.5">
                Contraseña
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E6E4] text-[14px] text-[#2B2429] placeholder:text-[#B0A3A8] focus:outline-none focus:ring-2 focus:ring-[#2B2429]/20 focus:border-[#2B2429] transition-all"
              />
            </div>

            {error && (
              <p className="text-[13px] text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl text-[14px] font-semibold text-white transition-all disabled:opacity-60"
              style={{ backgroundColor: '#2B2429' }}
            >
              {submitting ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-center text-[12px] text-[#B0A3A8] mt-5">
          ¿Problemas para acceder? Contacta con el administrador.
        </p>
      </div>
    </div>
  );
}

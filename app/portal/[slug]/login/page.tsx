'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { Mail, Lock, AlertCircle } from 'lucide-react';

export default function PortalLogin() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { loginConPassword } = usePortalAuth();
  const { studio } = useStudio();
  const { t } = useModo();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const r = await loginConPassword(email, password);
    setLoading(false);
    if ('error' in r) {
      setError(r.error || 'No se pudo iniciar sesión.');
      return;
    }
    // La sesión se propaga vía onAuthStateChange (usePortalAuth); PortalShell
    // redirige sola a /clases cuando resuelva. Empujamos por si tarda.
    router.replace(`/portal/${slug}/clases`);
  }

  const inicial = studio?.nombre?.trim()?.[0]?.toUpperCase() ?? 'T';
  const inputStyle: React.CSSProperties = {
    background: t.surface, border: `1px solid ${t.line}`, color: t.ink, borderRadius: 16,
  };

  return (
    <div style={{ minHeight: '100vh', background: t.bg, display: 'flex', flexDirection: 'column', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Hero con la identidad del estudio */}
      <div
        style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
          padding: '80px 24px 48px', minHeight: '45vh', background: t.hero, borderBottom: `1px solid ${t.heroLine}`, textAlign: 'center',
        }}
      >
        {studio?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={studio.logoUrl}
            alt={studio?.nombre ?? 'Logo'}
            style={{ width: 72, height: 72, borderRadius: 18, objectFit: 'cover', marginBottom: 16, background: t.surface2, border: `1px solid ${t.heroLine}` }}
          />
        ) : (
          <div style={{ width: 56, height: 56, borderRadius: 18, background: t.surface2, border: `1px solid ${t.heroLine}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.heroText, fontWeight: 800, fontSize: 22, marginBottom: 16 }}>
            {inicial}
          </div>
        )}
        <h1 style={{ color: t.heroText, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', textTransform: 'uppercase', lineHeight: 1.05 }}>
          {studio?.nombre ?? 'Tentare'}
        </h1>
        <p style={{ color: t.heroSub, fontSize: 13, marginTop: 4 }}>
          Pilates{studio?.ciudad ? ` · ${studio.ciudad}` : ''}
        </p>
      </div>

      {/* Hoja con el formulario */}
      <div style={{ position: 'relative', zIndex: 10, marginTop: -24, background: t.bg, borderRadius: '32px 32px 0 0', padding: '32px 24px 40px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '-0.01em', color: t.ink, lineHeight: 1.1 }}>Bienvenida de nuevo</h2>
        <p style={{ fontSize: 13, color: t.muted, marginTop: 4, marginBottom: 24 }}>Entra con tu email y contraseña para reservar tus clases</p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.muted, display: 'block', marginBottom: 6 }}>Email</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: t.muted }} />
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                placeholder="tu@email.com"
                required
                autoFocus
                autoComplete="email"
                style={{ ...inputStyle, width: '100%', paddingLeft: 40, paddingRight: 16, paddingTop: 14, paddingBottom: 14, fontSize: 16, outline: 'none' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.muted, display: 'block', marginBottom: 6 }}>Contraseña</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: t.muted }} />
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                style={{ ...inputStyle, width: '100%', paddingLeft: 40, paddingRight: 16, paddingTop: 14, paddingBottom: 14, fontSize: 16, outline: 'none' }}
              />
            </div>
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#B91C1C', background: 'rgba(239,68,68,0.1)', borderRadius: 14, padding: 12 }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <p>{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 16, background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
              fontWeight: 800, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.02em', border: 'none',
              opacity: loading || !email || !password ? 0.5 : 1,
            }}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <Link
          href={`/portal/${slug}/acceso`}
          style={{ display: 'block', marginTop: 20, fontSize: 13, fontWeight: 700, color: t.heroAccent, textAlign: 'center', textDecoration: 'underline' }}
        >
          ¿Primera vez o olvidaste tu contraseña?
        </Link>

        <p style={{ marginTop: 24, fontSize: 12, color: t.muted, textAlign: 'center' }}>
          ¿Eres nueva? Habla con tu instructora para que te añada como socia y puedas acceder.
        </p>
      </div>
    </div>
  );
}

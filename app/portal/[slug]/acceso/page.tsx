'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { Mail, AlertCircle, CheckCircle2 } from 'lucide-react';

// Verificación de propiedad del email por magic link. NO abre sesión "de uso":
// solo sirve para demostrar que la socia controla ese email, como paso previo
// a crear (primera vez) o restablecer (olvidó su contraseña) su contraseña en
// /clave-nueva. El día a día se entra con email + contraseña en /login.
export default function PortalAcceso() {
  const { slug } = useParams<{ slug: string }>();
  const { enviarEnlace } = usePortalAuth();
  const { studio } = useStudio();
  const { t } = useModo();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const r = await enviarEnlace(email);
    setLoading(false);
    if ('error' in r) {
      setError(r.error || 'No se pudo enviar el enlace.');
      return;
    }
    setEnviado(true);
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
        {enviado ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ width: 56, height: 56, borderRadius: 999, background: 'rgba(62,155,108,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <CheckCircle2 size={26} style={{ color: '#3E9B6C' }} />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '-0.01em', color: t.ink, lineHeight: 1.1 }}>Revisa tu email</h2>
            <p style={{ fontSize: 13, color: t.muted, marginTop: 8 }}>
              Te hemos enviado un enlace a{' '}
              <span style={{ fontWeight: 700, color: t.muted2 }}>{email}</span>. Ábrelo en este
              dispositivo para crear tu contraseña.
            </p>
            <button
              type="button"
              onClick={() => { setEnviado(false); setError(''); }}
              style={{ marginTop: 24, fontSize: 13, fontWeight: 700, color: t.muted, textDecoration: 'underline', background: 'none', border: 'none' }}
            >
              Usar otro email
            </button>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '-0.01em', color: t.ink, lineHeight: 1.1 }}>Crea o recupera tu acceso</h2>
            <p style={{ fontSize: 13, color: t.muted, marginTop: 4, marginBottom: 24 }}>
              Te enviaremos un enlace para verificar tu email y crear tu contraseña. Solo funciona si tu instructora ya te dio de alta como socia.
            </p>

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
                    style={{ ...inputStyle, width: '100%', paddingLeft: 40, paddingRight: 16, paddingTop: 14, paddingBottom: 14, fontSize: 14, outline: 'none' }}
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
                disabled={loading || !email}
                style={{
                  width: '100%', padding: '14px 0', borderRadius: 16, background: 'var(--portal-brand)', color: t.accentInk,
                  fontWeight: 800, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.02em', border: 'none',
                  opacity: loading || !email ? 0.5 : 1,
                }}
              >
                {loading ? 'Enviando...' : 'Enviar enlace'}
              </button>
            </form>

            <Link
              href={`/portal/${slug}/login`}
              style={{ display: 'block', marginTop: 20, fontSize: 13, fontWeight: 700, color: t.muted, textAlign: 'center', textDecoration: 'underline' }}
            >
              Ya tengo contraseña, volver a entrar
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

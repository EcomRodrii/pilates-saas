'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useModo } from '@/lib/portal-modo';
import { Lock, AlertCircle, CheckCircle2 } from 'lucide-react';

const MIN_LEN = 8;

// Llegada desde el magic link de /acceso. usePortalAuth ya resolvió (o no) la
// sesión: si `session` existe, Supabase confirmó el email Y el servidor
// confirmó que pertenece a una socia de este estudio (resolverSociaAutenticada).
// Solo entonces dejamos fijar la contraseña.
export default function PortalClaveNueva() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { session, isLoading, establecerPassword } = usePortalAuth();
  const { t } = useModo();
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [listo, setListo] = useState(false);

  const inputStyle: React.CSSProperties = {
    background: t.surface, border: `1px solid ${t.line}`, color: t.ink, borderRadius: 16,
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < MIN_LEN) {
      setError(`La contraseña debe tener al menos ${MIN_LEN} caracteres.`);
      return;
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    const r = await establecerPassword(password);
    setLoading(false);
    if ('error' in r) {
      setError(r.error || 'No se pudo guardar la contraseña.');
      return;
    }
    setListo(true);
    setTimeout(() => router.replace(`/portal/${slug}/home`), 1200);
  }

  return (
    <div style={{ minHeight: '100vh', background: t.bg, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 24, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ maxWidth: 400, width: '100%', margin: '0 auto' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ width: 32, height: 32, borderRadius: 999, border: `3px solid ${t.line}`, borderTopColor: t.ink, margin: '0 auto 16px' }} className="animate-spin" />
            <p style={{ fontSize: 14, color: t.muted }}>Verificando tu enlace...</p>
          </div>
        ) : !session ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 999, background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <AlertCircle size={26} style={{ color: '#EF4444' }} />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 800, textTransform: 'uppercase', color: t.ink }}>Enlace no válido</h1>
            <p style={{ fontSize: 13, color: t.muted, marginTop: 8, lineHeight: 1.5 }}>
              El enlace ha caducado, ya se usó, o tu email no corresponde a ninguna socia de este centro.
            </p>
            <Link
              href={`/portal/${slug}/acceso`}
              style={{ display: 'inline-block', marginTop: 20, fontSize: 13, fontWeight: 800, color: 'var(--portal-brand-foreground)', background: 'var(--portal-brand)', padding: '10px 20px', borderRadius: 14, textDecoration: 'none' }}
            >
              Pedir un enlace nuevo
            </Link>
          </div>
        ) : listo ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 999, background: 'rgba(62,155,108,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <CheckCircle2 size={26} style={{ color: '#3E9B6C' }} />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 800, textTransform: 'uppercase', color: t.ink }}>Contraseña guardada</h1>
            <p style={{ fontSize: 13, color: t.muted, marginTop: 8 }}>Te llevamos a tu portal...</p>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '-0.01em', color: t.ink, textAlign: 'center' }}>Crea tu contraseña</h1>
            <p style={{ fontSize: 13, color: t.muted, marginTop: 4, marginBottom: 24, textAlign: 'center' }}>
              Hola {session.nombre}, ya verificamos tu email. Elige una contraseña para tu portal.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.muted, display: 'block', marginBottom: 6 }}>Nueva contraseña</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: t.muted }} />
                  <input
                    type="password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(''); }}
                    placeholder={`Mínimo ${MIN_LEN} caracteres`}
                    required
                    autoFocus
                    autoComplete="new-password"
                    style={{ ...inputStyle, width: '100%', paddingLeft: 40, paddingRight: 16, paddingTop: 14, paddingBottom: 14, fontSize: 14, outline: 'none' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.muted, display: 'block', marginBottom: 6 }}>Confirmar contraseña</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: t.muted }} />
                  <input
                    type="password"
                    value={confirmar}
                    onChange={e => { setConfirmar(e.target.value); setError(''); }}
                    placeholder="Repite la contraseña"
                    required
                    autoComplete="new-password"
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
                disabled={loading || !password || !confirmar}
                style={{
                  width: '100%', padding: '14px 0', borderRadius: 16, background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
                  fontWeight: 800, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.02em', border: 'none',
                  opacity: loading || !password || !confirmar ? 0.5 : 1,
                }}
              >
                {loading ? 'Guardando...' : 'Guardar contraseña'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

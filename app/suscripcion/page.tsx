'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { PLANES, PLAN_INFO, type Plan } from '@/lib/entitlements';
import { estadoBilling, iniciarSuscripcion, gestionarSuscripcion, type EstadoBilling } from '@/lib/api-client';

const ACC = '#FFC8E2';

// Bullets por plan (derivadas del catálogo de entitlements, en lenguaje de la clienta).
const BULLETS: Record<Plan, string[]> = {
  BASE: ['Reservas y agenda', 'Cobros y bonos', 'Check-in y portal de socias', 'Hasta 150 socias'],
  ESTUDIO: ['Todo lo de Base', 'Socias ilimitadas', 'Gamificación y retención', 'Marketing e IA'],
  CADENA: ['Todo lo de Estudio', 'Varios centros', 'Todo incluido', 'Soporte dedicado'],
};

export default function SuscripcionPage() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoBilling | null>(null);
  const [cargandoEstado, setCargandoEstado] = useState(true);
  const [accion, setAccion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [loading, session, router]);

  useEffect(() => {
    if (!session) return;
    let vivo = true;
    estadoBilling().then((e) => {
      if (vivo) {
        setEstado(e);
        setCargandoEstado(false);
      }
    });
    return () => { vivo = false; };
  }, [session]);

  async function suscribir(plan: Plan) {
    setError(null);
    setAccion(plan);
    const r = await iniciarSuscripcion(plan);
    if ('url' in r) {
      window.location.href = r.url;
    } else {
      setError(r.error);
      setAccion(null);
    }
  }

  async function abrirPortal() {
    setError(null);
    setAccion('portal');
    const r = await gestionarSuscripcion();
    if ('url' in r) {
      window.location.href = r.url;
    } else {
      setError(r.error);
      setAccion(null);
    }
  }

  if (loading || !session) return null;

  const activo = estado?.activo ?? false;
  const esPropietaria = estado?.esPropietaria ?? true;
  const stripeListo = estado?.configurado ?? false;

  return (
    <div style={{ minHeight: '100vh', background: '#EEEEE8', color: '#1A1A1A' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '56px 24px 80px' }}>
        <header style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 13, letterSpacing: '.14em', textTransform: 'uppercase', color: '#B57A8E', fontWeight: 600, marginBottom: 12 }}>
            Suscripción de tu estudio
          </div>
          <h1 style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-.03em', margin: '0 0 10px' }}>
            {activo ? 'Tu estudio está activo' : 'Elige el plan de tu estudio'}
          </h1>
          <p style={{ fontSize: 18, color: '#5A5A52', margin: 0 }}>
            {activo
              ? 'Tu suscripción está al día. Puedes cambiar de plan o gestionar tu facturación cuando quieras.'
              : 'Sin permanencia. Cancela cuando quieras. Precios con todo incluido.'}
          </p>
        </header>

        {error && (
          <div role="alert" style={{ maxWidth: 640, margin: '0 auto 24px', background: '#FFF0F0', border: '1px solid #F3C4C4', color: '#8A2E2E', borderRadius: 12, padding: '12px 16px', fontSize: 14 }}>
            {error}
          </div>
        )}

        {!cargandoEstado && !stripeListo && !activo && (
          <div style={{ maxWidth: 640, margin: '0 auto 24px', background: '#FFF8E6', border: '1px solid #F0E0A8', color: '#6B551A', borderRadius: 12, padding: '12px 16px', fontSize: 14 }}>
            Los pagos aún no están configurados en este entorno. Configura las claves de Stripe y los <code>STRIPE_PRICE_*</code> para activar la suscripción.
          </div>
        )}

        {activo ? (
          <div style={{ maxWidth: 460, margin: '0 auto', background: '#FFFFFF', border: '1px solid #E7E7E0', borderRadius: 20, padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8E8E86', marginBottom: 8 }}>Plan actual</div>
            <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>{PLAN_INFO[(estado?.plan as Plan) ?? 'BASE'].nombre}</div>
            <div style={{ fontSize: 14, color: '#5A5A52', marginBottom: 24 }}>{PLAN_INFO[(estado?.plan as Plan) ?? 'BASE'].resumen}</div>
            {esPropietaria ? (
              <button onClick={abrirPortal} disabled={accion === 'portal'} style={btnPrimary}>
                {accion === 'portal' ? 'Abriendo…' : 'Gestionar suscripción'}
              </button>
            ) : (
              <p style={{ fontSize: 14, color: '#8E8E86', margin: 0 }}>Solo la propietaria puede gestionar la facturación.</p>
            )}
            <div style={{ marginTop: 20 }}>
              <Link href="/dashboard" style={{ fontSize: 14, color: '#B57A8E', textDecoration: 'none' }}>Volver al panel →</Link>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, alignItems: 'stretch' }} className="susc-grid">
              {PLANES.map((plan) => {
                const info = PLAN_INFO[plan];
                const destacado = plan === 'ESTUDIO';
                return (
                  <div
                    key={plan}
                    style={{
                      background: destacado ? '#0F0F0F' : '#FFFFFF',
                      color: destacado ? '#E8E8E4' : '#1A1A1A',
                      border: destacado ? 'none' : '1px solid #E7E7E0',
                      borderRadius: 22,
                      padding: 30,
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    {destacado && (
                      <div style={{ position: 'absolute', top: -12, left: 30, background: ACC, color: '#171717', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', padding: '5px 12px', borderRadius: 999 }}>
                        POPULAR
                      </div>
                    )}
                    <div style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: destacado ? '#F7A6C4' : '#8E8E86', marginBottom: 14 }}>{info.nombre}</div>
                    <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-.03em' }}>
                      {info.precioMes}€<span style={{ fontSize: 16, fontWeight: 500, color: '#8E8E86' }}>/mes</span>
                    </div>
                    <p style={{ fontSize: 13.5, color: destacado ? '#8E8E86' : '#5A5A52', margin: '6px 0 20px' }}>{info.resumen}</p>
                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', fontSize: 14.5, lineHeight: 1.9, color: destacado ? '#D8D8D2' : '#5A5A52', flex: 1 }}>
                      {BULLETS[plan].map((b) => (
                        <li key={b} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{ color: destacado ? ACC : '#B57A8E', flexShrink: 0 }}>✓</span> {b}
                        </li>
                      ))}
                    </ul>
                    {esPropietaria ? (
                      <button
                        onClick={() => suscribir(plan)}
                        disabled={accion !== null || !stripeListo}
                        style={{
                          ...btnPrimary,
                          background: destacado ? ACC : '#0F0F0F',
                          color: destacado ? '#171717' : '#FFFFFF',
                          opacity: !stripeListo ? 0.5 : 1,
                          cursor: !stripeListo || accion !== null ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {accion === plan ? 'Redirigiendo…' : `Suscribirme a ${info.nombre}`}
                      </button>
                    ) : (
                      <div style={{ fontSize: 13, color: '#8E8E86', textAlign: 'center' }}>Pídeselo a la propietaria</div>
                    )}
                  </div>
                );
              })}
            </div>
            <p style={{ textAlign: 'center', fontSize: 13, color: '#8E8E86', marginTop: 28 }}>
              Los pagos de tus socias van directos a tu cuenta de Stripe — Tentare no cobra comisión sobre ellos.
            </p>
          </>
        )}
      </div>
      <style>{`
        @media (max-width: 820px) { .susc-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  width: '100%',
  border: 'none',
  borderRadius: 12,
  padding: '13px 18px',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
  background: '#0F0F0F',
  color: '#FFFFFF',
};

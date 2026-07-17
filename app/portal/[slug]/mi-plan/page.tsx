'use client';

import { useMemo, useState } from 'react';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { CheckCircle2, Clock, XCircle, CreditCard, AlertCircle } from 'lucide-react';

type Filtro = 'TODOS' | 'COBRADO' | 'PENDIENTE';

export default function MiPlanPage() {
  const { session } = usePortalAuth();
  const { suscripciones, planesTarifa, recibos, facturas } = useStudio();
  const { t } = useModo();
  const [filtro, setFiltro] = useState<Filtro>('TODOS');
  const socioId = session?.socioId;

  const suscripcion = useMemo(() =>
    suscripciones.find(s => s.socioId === socioId && s.estado === 'ACTIVA') ??
    suscripciones.filter(s => s.socioId === socioId).sort((a, b) =>
      new Date(b.fechaInicio).getTime() - new Date(a.fechaInicio).getTime())[0] ?? null,
  [suscripciones, socioId]);

  const plan = useMemo(() =>
    suscripcion ? planesTarifa.find(p => p.id === suscripcion.planId) ?? null : null,
  [planesTarifa, suscripcion]);

  const misRecibos = useMemo(() =>
    recibos.filter(r => r.socioId === socioId)
      .sort((a, b) => new Date(b.fechaVencimiento).getTime() - new Date(a.fechaVencimiento).getTime()),
  [recibos, socioId]);

  const recibosFiltrados = useMemo(() => {
    if (filtro === 'COBRADO') return misRecibos.filter(r => r.estado === 'COBRADO');
    if (filtro === 'PENDIENTE') return misRecibos.filter(r => r.estado === 'PENDIENTE' || r.estado === 'EN_CURSO');
    return misRecibos;
  }, [misRecibos, filtro]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  const formatEur = (n: number) =>
    n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

  const sesionesProgress = plan?.tipo === 'BONO' && plan.sesiones && suscripcion?.sesionesRestantes != null
    ? Math.min(100, Math.round((suscripcion.sesionesRestantes / plan.sesiones) * 100))
    : null;

  const totalPagado = misRecibos.filter(r => r.estado === 'COBRADO').reduce((s, r) => s + r.importe, 0);

  const hoyStr = new Date().toISOString().slice(0, 10);
  const caducada = !!(suscripcion?.fechaFin && suscripcion.fechaFin < hoyStr);

  const card: React.CSSProperties = { background: t.surface, border: `1px solid ${t.line}`, borderRadius: 22 };
  const microLabel: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.muted };

  return (
    <div style={{ minHeight: '100%', background: t.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>

      {/* Header */}
      <div style={{ padding: '24px 20px 20px' }}>
        <h1 style={{ color: t.ink, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', textTransform: 'uppercase', lineHeight: 1 }}>Mi plan</h1>
        <p style={{ color: t.muted, fontSize: 13, marginTop: 4 }}>{formatEur(totalPagado)} pagado en total</p>
      </div>

      <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Plan card */}
        {plan && suscripcion ? (
          <div style={{ borderRadius: 26, overflow: 'hidden', border: `1px solid ${t.heroLine}` }}>
            <div style={{ padding: 20, background: t.hero }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <p style={{ ...microLabel, color: t.heroAccent, marginBottom: 4 }}>
                    {plan.tipo === 'MENSUAL' ? 'Suscripción mensual' : 'Bono de sesiones'}
                  </p>
                  <p style={{ color: t.heroText, fontSize: 22, fontWeight: 800, lineHeight: 1.1, textTransform: 'uppercase' }}>{plan.nombre}</p>
                </div>
                {caducada ? (
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '5px 10px', borderRadius: 999, background: '#DC2626', color: '#fff' }}>Caducado</span>
                ) : (
                  <div style={{ width: 40, height: 40, borderRadius: 14, background: t.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CreditCard size={18} style={{ color: t.heroAccent }} />
                  </div>
                )}
              </div>
              {caducada && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: t.surface2, borderRadius: 16, padding: '10px 16px', marginBottom: 12 }}>
                  <AlertCircle size={15} style={{ color: '#DC2626', flexShrink: 0 }} />
                  <p style={{ color: t.heroText, fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>
                    Venció el {formatDate(suscripcion.fechaFin!)}. Habla con tu instructor para renovar.
                  </p>
                </div>
              )}

              {sesionesProgress !== null && suscripcion.sesionesRestantes != null && plan.sesiones ? (
                <div style={{ background: t.surface2, borderRadius: 16, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                    <span style={{ color: t.heroText, fontSize: 24, fontWeight: 800 }}>{suscripcion.sesionesRestantes}</span>
                    <span style={{ color: t.heroSub, fontSize: 13 }}>de {plan.sesiones} sesiones</span>
                  </div>
                  <div style={{ height: 8, background: t.bar, borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{
                      width: `${sesionesProgress}%`, height: '100%', borderRadius: 999,
                      backgroundColor: suscripcion.sesionesRestantes > 3 ? 'var(--portal-brand)' : '#EF4444',
                    }} />
                  </div>
                </div>
              ) : (
                <div style={{ background: t.surface2, borderRadius: 16, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ color: t.heroSub, fontSize: 11 }}>Inicio</p>
                    <p style={{ color: t.heroText, fontWeight: 800, fontSize: 14 }}>{formatDate(suscripcion.fechaInicio)}</p>
                  </div>
                  {suscripcion.fechaFin && (
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ color: t.heroSub, fontSize: 11 }}>Vence</p>
                      <p style={{ color: t.heroText, fontWeight: 800, fontSize: 14 }}>{formatDate(suscripcion.fechaFin)}</p>
                    </div>
                  )}
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ color: t.heroSub, fontSize: 11 }}>Precio</p>
                    <p style={{ color: t.heroText, fontWeight: 800, fontSize: 16 }}>{formatEur(plan.precio)}/mes</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ ...card, padding: 32, textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 18, background: t.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <CreditCard size={24} style={{ color: t.heroAccent }} />
            </div>
            <p style={{ fontWeight: 800, color: t.ink, fontSize: 16 }}>Sin plan activo</p>
            <p style={{ fontSize: 13, color: t.muted, marginTop: 4 }}>Habla con tu instructor para contratar un plan</p>
          </div>
        )}

        {/* Historial */}
        <div>
          <p style={{ ...microLabel, marginBottom: 12 }}>Historial de pagos</p>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {(['TODOS', 'COBRADO', 'PENDIENTE'] as Filtro[]).map(f => {
              const active = filtro === f;
              return (
                <button
                  key={f}
                  onClick={() => setFiltro(f)}
                  style={{
                    padding: '6px 14px', borderRadius: 16, fontSize: 12, fontWeight: 800, border: `1px solid ${active ? 'var(--portal-brand)' : t.line}`,
                    backgroundColor: active ? 'var(--portal-brand)' : t.surface2, color: active ? t.accentInk : t.muted,
                  }}
                >
                  {f === 'TODOS' ? 'Todos' : f === 'COBRADO' ? 'Pagados' : 'Pendientes'}
                </button>
              );
            })}
          </div>

          {recibosFiltrados.length === 0 ? (
            <div style={{ borderRadius: 18, background: t.surface2, padding: 32, textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: t.muted }}>Sin recibos en esta categoría</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recibosFiltrados.map(rec => {
                const factura = facturas.find(f => f.reciboId === rec.id);
                const cobrado = rec.estado === 'COBRADO';
                const devuelto = rec.estado === 'DEVUELTO';
                return (
                  <div key={rec.id} style={{ ...card, borderRadius: 18, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      background: cobrado ? 'rgba(62,155,108,0.12)' : devuelto ? 'rgba(239,68,68,0.12)' : 'rgba(217,119,6,0.12)',
                    }}>
                      {cobrado ? <CheckCircle2 size={18} style={{ color: '#3E9B6C' }} />
                        : devuelto ? <XCircle size={18} style={{ color: '#EF4444' }} />
                        : <Clock size={18} style={{ color: '#D97706' }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.concepto}</p>
                      <p style={{ fontSize: 11, color: t.muted, marginTop: 2 }}>
                        {formatDate(rec.fechaCobro ?? rec.fechaVencimiento)}
                        {factura && <span style={{ color: t.heroAccent, marginLeft: 8, fontWeight: 700 }}>· Factura</span>}
                      </p>
                    </div>
                    <p style={{ fontSize: 15, fontWeight: 800, flexShrink: 0, color: cobrado ? '#3E9B6C' : t.muted }}>
                      {formatEur(rec.importe)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

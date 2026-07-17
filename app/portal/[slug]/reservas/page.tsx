'use client';

import { useMemo, useState } from 'react';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { Calendar, Clock, MapPin, User as UserIcon, X } from 'lucide-react';
import type { Reserva, Sesion } from '@/lib/types';

type Tab = 'PROXIMAS' | 'PASADAS' | 'CANCELADAS' | 'ESPERA';

export default function MisReservasPage() {
  const { session } = usePortalAuth();
  const { reservas, sesiones, tiposClase, salas, instructores, cancelarReserva } = useStudio();
  const { t } = useModo();
  const [tab, setTab] = useState<Tab>('PROXIMAS');
  const [cancelando, setCancelando] = useState<Reserva | null>(null);
  const socioId = session?.socioId;
  const now = new Date();

  const ESTADO_BADGE: Record<string, { label: string; bg: string; color: string }> = {
    CONFIRMADA: { label: 'Confirmada', bg: 'rgba(62,155,108,0.14)', color: '#3E9B6C' },
    LISTA_ESPERA: { label: 'Lista de espera', bg: 'rgba(217,119,6,0.14)', color: '#D97706' },
    ASISTIDA: { label: 'Asistida', bg: 'rgba(3,105,161,0.14)', color: '#0369A1' },
    CANCELADA: { label: 'Cancelada', bg: t.surface2, color: t.muted },
    NO_ASISTIO: { label: 'No asistió', bg: 'rgba(220,38,38,0.14)', color: '#DC2626' },
  };

  const misReservas = useMemo(() =>
    reservas
      .filter(r => r.socioId === socioId)
      .map(r => ({ r, s: sesiones.find(x => x.id === r.sesionId) ?? null }))
      .filter((x): x is { r: Reserva; s: Sesion } => !!x.s),
  [reservas, sesiones, socioId]);

  const porTab = useMemo(() => {
    const proximas = misReservas
      .filter(x => x.r.estado === 'CONFIRMADA' && new Date(x.s.inicio) >= now)
      .sort((a, b) => new Date(a.s.inicio).getTime() - new Date(b.s.inicio).getTime());
    const pasadas = misReservas
      .filter(x => x.r.estado === 'ASISTIDA' || x.r.estado === 'NO_ASISTIO' || (x.r.estado === 'CONFIRMADA' && new Date(x.s.inicio) < now))
      .sort((a, b) => new Date(b.s.inicio).getTime() - new Date(a.s.inicio).getTime());
    const canceladas = misReservas
      .filter(x => x.r.estado === 'CANCELADA')
      .sort((a, b) => new Date(b.s.inicio).getTime() - new Date(a.s.inicio).getTime());
    const espera = misReservas
      .filter(x => x.r.estado === 'LISTA_ESPERA')
      .sort((a, b) => new Date(a.s.inicio).getTime() - new Date(b.s.inicio).getTime());
    return { PROXIMAS: proximas, PASADAS: pasadas, CANCELADAS: canceladas, ESPERA: espera };
  }, [misReservas, now]);

  const lista = porTab[tab];

  const formatFecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  const formatHora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  const TABS: { id: Tab; label: string }[] = [
    { id: 'PROXIMAS', label: 'Próximas' },
    { id: 'PASADAS', label: 'Pasadas' },
    { id: 'CANCELADAS', label: 'Canceladas' },
    { id: 'ESPERA', label: 'Lista de espera' },
  ];

  const card: React.CSSProperties = { background: t.surface, border: `1px solid ${t.line}`, borderRadius: 18 };

  return (
    <div style={{ minHeight: '100%', background: t.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ padding: '24px 20px 20px' }}>
        <h1 style={{ color: t.ink, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', textTransform: 'uppercase', lineHeight: 1 }}>Mis reservas</h1>
        <p style={{ color: t.muted, fontSize: 13, marginTop: 4 }}>Historial completo de tus clases</p>
      </div>

      <div style={{ padding: '0 16px 24px' }}>
        {/* Tabs */}
        <div style={{ position: 'relative', marginBottom: 16, marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16 }}>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' } as React.CSSProperties}>
            {TABS.map(tb => {
              const active = tab === tb.id;
              return (
                <button
                  key={tb.id}
                  onClick={() => setTab(tb.id)}
                  style={{
                    flexShrink: 0, padding: '6px 14px', borderRadius: 16, fontSize: 12, fontWeight: 800, border: `1px solid ${active ? 'var(--portal-brand)' : t.line}`,
                    backgroundColor: active ? 'var(--portal-brand)' : t.surface2, color: active ? t.accentInk : t.muted,
                  }}
                >
                  {tb.label}
                  {porTab[tb.id].length > 0 && ` (${porTab[tb.id].length})`}
                </button>
              );
            })}
          </div>
        </div>

        {lista.length === 0 ? (
          <div style={{ borderRadius: 20, background: t.surface2, padding: 32, textAlign: 'center' }}>
            <Calendar size={28} style={{ color: t.muted, margin: '0 auto 8px' }} />
            <p style={{ fontSize: 14, color: t.muted }}>Nada por aquí todavía</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lista.map(({ r, s }) => {
              const tipo = tiposClase.find(tc => tc.id === s.tipoClaseId);
              const sala = salas.find(x => x.id === s.salaId);
              const instr = instructores.find(i => i.id === s.instructorId);
              const badge = ESTADO_BADGE[r.estado] ?? ESTADO_BADGE.CANCELADA;
              const puedeCancel = r.estado === 'CONFIRMADA' && new Date(s.inicio) > now;
              return (
                <div key={r.id} style={{ ...card, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 800, color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>{tipo?.nombre ?? 'Clase'}</p>
                      <p style={{ fontSize: 12, color: t.muted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={11} /> {formatFecha(s.inicio)} <Clock size={11} style={{ marginLeft: 6 }} /> {formatHora(s.inicio)}
                      </p>
                    </div>
                    <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '4px 8px', borderRadius: 999, backgroundColor: badge.bg, color: badge.color }}>
                      {badge.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: t.muted }}>
                    {instr && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><UserIcon size={11} />{instr.nombre}</span>}
                    {sala && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={11} />{sala.nombre}</span>}
                  </div>
                  {puedeCancel && (
                    <button
                      onClick={() => setCancelando(r)}
                      style={{ marginTop: 12, width: '100%', padding: '8px 0', borderRadius: 14, border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444', fontSize: 12, fontWeight: 800, background: 'transparent' }}
                    >
                      Cancelar reserva
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm cancel */}
      {cancelando && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} onClick={() => setCancelando(null)} />
          <div style={{ position: 'relative', width: '100%', background: t.bg, borderRadius: '24px 24px 0 0', padding: '20px 20px 32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: t.ink }}>¿Cancelar esta clase?</h2>
              <button onClick={() => setCancelando(null)} style={{ width: 32, height: 32, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.surface2, color: t.muted, border: 'none' }}>
                <X size={16} />
              </button>
            </div>
            <p style={{ fontSize: 13, color: t.muted, marginBottom: 20 }}>Perderás tu plaza y liberarás el hueco para otra socia.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setCancelando(null)} style={{ flex: 1, padding: '12px 0', borderRadius: 16, border: `1px solid ${t.line}`, color: t.muted2, fontSize: 14, fontWeight: 700, background: 'transparent' }}>
                Volver
              </button>
              <button
                onClick={() => { cancelarReserva(cancelando.id); setCancelando(null); }}
                style={{ flex: 1, padding: '12px 0', borderRadius: 16, background: '#EF4444', color: '#fff', fontSize: 14, fontWeight: 800, border: 'none' }}
              >
                Sí, cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

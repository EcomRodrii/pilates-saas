'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { tieneCoberturaPlan } from '@/lib/portal-home-logic';
import { useModo } from '@/lib/portal-modo';
import { Clock, MapPin, BarChart2, CheckCircle, AlertCircle, Users } from 'lucide-react';

type Tab = 'proximas' | 'mis-reservas';

const NIVEL_LABEL: Record<string, string> = {
  TODOS: 'Todos los niveles', PRINCIPIANTE: 'Iniciación', MEDIO: 'Intermedio', AVANZADO: 'Avanzado',
};
const NIVEL_COLOR: Record<string, string> = {
  TODOS: '#8E8E93', PRINCIPIANTE: '#059669', MEDIO: '#D97706', AVANZADO: '#DC2626',
};

export default function ClasesPage() {
  const { slug } = useParams<{ slug: string }>();
  const { session } = usePortalAuth();
  const { sesiones, reservas, tiposClase, salas, instructores, planesTarifa, suscripciones, addReserva, cancelarReserva } = useStudio();
  const { t } = useModo();
  const [tab, setTab] = useState<Tab>('proximas');
  const now = new Date();

  const precioClaseSuelta = planesTarifa.find(p => p.tipo === 'PUNTUAL' && p.activo)?.precio ?? null;

  const activeSus = useMemo(() =>
    suscripciones.find(s => s.socioId === session?.socioId && s.estado === 'ACTIVA') ?? null,
  [suscripciones, session?.socioId]);
  const planActivo = activeSus ? planesTarifa.find(p => p.id === activeSus.planId) ?? null : null;
  const cubierta = tieneCoberturaPlan(activeSus, planActivo);

  const sesionesActivas = useMemo(() =>
    sesiones
      .filter(s => !s.cancelada && new Date(s.inicio) > now)
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime()),
  [sesiones]);

  const misReservas = useMemo(() =>
    reservas.filter(r => r.socioId === session?.socioId), [reservas, session?.socioId]);

  const sesionesFiltradas = useMemo(() => {
    if (tab === 'mis-reservas') {
      const ids = new Set(misReservas.filter(r => r.estado === 'CONFIRMADA' || r.estado === 'LISTA_ESPERA').map(r => r.sesionId));
      return sesionesActivas.filter(s => ids.has(s.id));
    }
    return sesionesActivas;
  }, [tab, sesionesActivas, misReservas]);

  const groupedByDay = useMemo(() => {
    const groups: { dayKey: string; label: string; items: typeof sesionesFiltradas }[] = [];
    for (const ses of sesionesFiltradas) {
      const d = new Date(ses.inicio);
      const dayKey = d.toISOString().slice(0, 10);
      const isToday = dayKey === now.toISOString().slice(0, 10);
      const isTomorrow = dayKey === new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
      const label = isToday ? 'Hoy'
        : isTomorrow ? 'Mañana'
        : d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
      const last = groups[groups.length - 1];
      if (last?.dayKey === dayKey) last.items.push(ses);
      else groups.push({ dayKey, label: label.charAt(0).toUpperCase() + label.slice(1), items: [ses] });
    }
    return groups;
  }, [sesionesFiltradas]);

  const getMiReserva = (sesionId: string) =>
    misReservas.find(r => r.sesionId === sesionId && (r.estado === 'CONFIRMADA' || r.estado === 'LISTA_ESPERA')) ?? null;

  const getLibres = (sesionId: string, aforo: number) =>
    aforo - reservas.filter(r => r.sesionId === sesionId && r.estado === 'CONFIRMADA').length;

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  const totalReservas = misReservas.filter(r => r.estado === 'CONFIRMADA').length;

  const card: React.CSSProperties = { background: t.surface, border: `1px solid ${t.line}`, borderRadius: 22 };
  const microLabel: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.muted };

  return (
    <div style={{ minHeight: '100%', background: t.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>

      {/* Header */}
      <div style={{ padding: '24px 20px 20px' }}>
        <h1 style={{ color: t.ink, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', textTransform: 'uppercase', lineHeight: 1 }}>Clases</h1>
        <p style={{ color: t.muted, fontSize: 13, marginTop: 4 }}>{totalReservas} reservas activas</p>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          {([['proximas', 'Todas las clases'], ['mis-reservas', 'Mis reservas']] as [Tab, string][]).map(([key, label]) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  minHeight: 44, display: 'flex', alignItems: 'center', padding: '0 16px', borderRadius: 16, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', border: `1px solid ${active ? 'var(--portal-brand)' : t.line}`,
                  background: active ? 'var(--portal-brand)' : t.surface, color: active ? 'var(--portal-brand-foreground)' : t.muted,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {groupedByDay.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: 24, background: t.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Clock size={28} style={{ color: t.heroAccent }} />
            </div>
            <p style={{ fontWeight: 800, color: t.ink, fontSize: 16 }}>
              {tab === 'mis-reservas' ? 'Sin reservas activas' : 'Sin clases disponibles'}
            </p>
            <p style={{ fontSize: 13, color: t.muted, marginTop: 4 }}>
              {tab === 'mis-reservas' ? 'Reserva una clase en la pestaña anterior' : 'Próximamente habrá nuevas clases'}
            </p>
          </div>
        ) : (
          groupedByDay.map(group => (
            <div key={group.dayKey}>
              <p style={{ ...microLabel, marginBottom: 12 }}>{group.label}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {group.items.map(ses => {
                  const tipo = tiposClase.find(t2 => t2.id === ses.tipoClaseId);
                  const sala = salas.find(s => s.id === ses.salaId);
                  const instr = instructores.find(i => i.id === ses.instructorId);
                  const libres = getLibres(ses.id, ses.aforoMaximo);
                  const miReserva = getMiReserva(ses.id);
                  const color = tipo?.color ?? 'var(--portal-brand)';

                  return (
                    <div key={ses.id} style={{ ...card, overflow: 'hidden' }}>
                      <Link href={`/portal/${slug}/clases/${ses.id}`} style={{ display: 'block' }}>
                        {/* Foto (o bloque de color de respaldo) */}
                        <div style={{ position: 'relative', height: 144 }}>
                          {tipo?.fotoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={tipo.fotoUrl} alt={tipo.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: color }}>
                              <BarChart2 size={28} style={{ color: 'rgba(255,255,255,0.4)' }} />
                            </div>
                          )}
                          {!cubierta && precioClaseSuelta != null && (
                            <span style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 12, fontWeight: 800, padding: '4px 12px', borderRadius: 999 }}>
                              {precioClaseSuelta} €
                            </span>
                          )}
                          {miReserva?.estado === 'CONFIRMADA' && (
                            <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 4, background: t.surface, padding: '4px 10px', borderRadius: 999 }}>
                              <CheckCircle size={11} style={{ color: '#3E9B6C' }} />
                              <span style={{ fontSize: 11, fontWeight: 800, color: '#3E9B6C' }}>Reservada</span>
                            </div>
                          )}
                          {miReserva?.estado === 'LISTA_ESPERA' && (
                            <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 4, background: t.surface, padding: '4px 10px', borderRadius: 999 }}>
                              <AlertCircle size={11} style={{ color: '#B45309' }} />
                              <span style={{ fontSize: 11, fontWeight: 800, color: '#B45309' }}>En espera</span>
                            </div>
                          )}
                        </div>

                        <div style={{ padding: '16px 16px 0' }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: t.muted, marginBottom: 4 }}>
                            {formatTime(ses.inicio)} – {formatTime(ses.fin)}
                          </p>
                          <p style={{ fontWeight: 800, color: t.ink, fontSize: 19, lineHeight: 1.1, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '-0.01em' }}>{tipo?.nombre ?? 'Clase'}</p>

                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                            <span
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, padding: '6px 12px', borderRadius: 999,
                                backgroundColor: libres === 0 ? 'rgba(239,68,68,0.14)' : libres <= 2 ? 'rgba(217,119,6,0.14)' : t.surface2,
                                color: libres === 0 ? '#DC2626' : libres <= 2 ? '#B45309' : t.muted2,
                              }}
                            >
                              <Users size={13} />
                              {libres > 0 ? `${libres} ${libres === 1 ? 'plaza' : 'plazas'}` : 'Completo'}
                            </span>
                            {sala && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6, background: t.surface2, color: t.muted2, fontSize: 12.5, fontWeight: 700, padding: '6px 12px', borderRadius: 999 }}>
                                <MapPin size={13} />
                                {sala.nombre}
                              </span>
                            )}
                            <span
                              style={{ fontSize: 12.5, fontWeight: 800, color: '#fff', padding: '6px 12px', borderRadius: 999, backgroundColor: NIVEL_COLOR[tipo?.nivel ?? 'TODOS'] }}
                            >
                              {NIVEL_LABEL[tipo?.nivel ?? 'TODOS']}
                            </span>
                          </div>

                          {instr && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 16, marginBottom: 4, borderBottom: `1px solid ${t.line}` }}>
                              <div
                                style={{ width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0, backgroundColor: instr.color }}
                              >
                                {instr.nombre.charAt(0).toUpperCase()}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <p style={{ fontSize: 13.5, fontWeight: 800, color: t.ink, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{instr.nombre}</p>
                                <p style={{ fontSize: 11.5, color: t.muted }}>{instr.rol === 'PROPIETARIO' ? 'Directora' : 'Instructora'}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </Link>

                      <div style={{ padding: '12px 16px 16px' }}>
                        {miReserva?.estado === 'CONFIRMADA' ? (
                          <button
                            onClick={() => cancelarReserva(miReserva.id)}
                            style={{ width: '100%', minHeight: 44, fontSize: 13, fontWeight: 800, color: '#EF4444', padding: '0', borderRadius: 16, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent' }}
                          >
                            Cancelar reserva
                          </button>
                        ) : !miReserva && (
                          <button
                            onClick={() => session?.socioId && addReserva(ses.id, session.socioId)}
                            disabled={libres <= 0}
                            style={{
                              width: '100%', minHeight: 44, fontSize: 14, fontWeight: 800, textTransform: 'uppercase', padding: '0', borderRadius: 16, border: 'none',
                              color: libres > 0 ? 'var(--portal-brand-foreground)' : t.muted, backgroundColor: libres > 0 ? 'var(--portal-brand)' : t.surface2, opacity: libres <= 0 ? 0.6 : 1,
                            }}
                          >
                            {libres > 0
                              ? (cubierta || precioClaseSuelta == null ? 'Reservar' : `Reservar · ${precioClaseSuelta} €`)
                              : 'Lista de espera'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

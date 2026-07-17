'use client';

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { tieneCoberturaPlan } from '@/lib/portal-home-logic';
import { useModo } from '@/lib/portal-modo';
import { ChevronLeft, Clock, Users, MapPin, BarChart2, CheckCircle, AlertCircle } from 'lucide-react';

const NIVEL_LABEL: Record<string, string> = {
  TODOS: 'Todos los niveles', PRINCIPIANTE: 'Iniciación', MEDIO: 'Intermedio', AVANZADO: 'Avanzado',
};

export default function ClaseDetallePage() {
  const router = useRouter();
  const { slug, sesionId } = useParams<{ slug: string; sesionId: string }>();
  const { session } = usePortalAuth();
  const { sesiones, reservas, tiposClase, salas, instructores, planesTarifa, suscripciones, addReserva, cancelarReserva } = useStudio();
  const { t } = useModo();

  const ses = sesiones.find(s => s.id === sesionId);
  const tipo = ses ? tiposClase.find(t2 => t2.id === ses.tipoClaseId) : undefined;
  const sala = ses ? salas.find(s => s.id === ses.salaId) : undefined;
  const instr = ses ? instructores.find(i => i.id === ses.instructorId) : undefined;
  const color = tipo?.color ?? 'var(--portal-brand)';

  const precioClaseSuelta = planesTarifa.find(p => p.tipo === 'PUNTUAL' && p.activo)?.precio ?? null;
  const activeSus = useMemo(() =>
    suscripciones.find(s => s.socioId === session?.socioId && s.estado === 'ACTIVA') ?? null,
  [suscripciones, session?.socioId]);
  const planActivo = activeSus ? planesTarifa.find(p => p.id === activeSus.planId) ?? null : null;
  const cubierta = tieneCoberturaPlan(activeSus, planActivo);

  const libres = useMemo(() => {
    if (!ses) return 0;
    return ses.aforoMaximo - reservas.filter(r => r.sesionId === ses.id && r.estado === 'CONFIRMADA').length;
  }, [ses, reservas]);

  const miReserva = useMemo(() => {
    if (!ses || !session?.socioId) return null;
    return reservas.find(r => r.sesionId === ses.id && r.socioId === session.socioId && (r.estado === 'CONFIRMADA' || r.estado === 'LISTA_ESPERA')) ?? null;
  }, [ses, reservas, session?.socioId]);

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const formatDayFull = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  if (!ses) {
    return (
      <div style={{ background: t.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <p style={{ fontWeight: 800, color: t.ink, fontSize: 16 }}>Esta clase ya no está disponible</p>
        <button
          onClick={() => router.push(`/portal/${slug}/clases`)}
          style={{ marginTop: 16, fontSize: 13, fontWeight: 800, color: t.heroAccent, background: 'none', border: 'none' }}
        >
          Volver a Clases
        </button>
      </div>
    );
  }

  const microLabel: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.muted };

  return (
    <div style={{ minHeight: '100%', background: t.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ padding: '24px 20px 40px', position: 'relative', overflow: 'hidden', background: `linear-gradient(135deg, ${color}ee, ${color}99)` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <button
            onClick={() => router.back()}
            style={{ width: 36, height: 36, borderRadius: 999, background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}
          >
            <ChevronLeft size={18} style={{ color: '#fff' }} />
          </button>
          <div style={{ width: 36, height: 36, borderRadius: 999, background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BarChart2 size={16} style={{ color: '#fff' }} />
          </div>
        </div>
        <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.15)', borderRadius: 999, padding: '4px 12px', marginBottom: 12 }}>
          {NIVEL_LABEL[tipo?.nivel ?? 'TODOS']}
        </span>
        <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.02em', textTransform: 'uppercase' }}>{tipo?.nombre ?? 'Clase'}</h1>
      </div>

      <div style={{ padding: '0 16px 32px', marginTop: -20 }}>
        <div style={{ background: t.surface, borderRadius: 26, padding: 20, border: `1px solid ${t.line}`, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          {/* Instructor */}
          {instr && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 16, borderBottom: `1px solid ${t.line}` }}>
              <div style={{ width: 44, height: 44, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 15, flexShrink: 0, backgroundColor: instr.color }}>
                {instr.nombre.charAt(0).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {instr.nombre}{sala ? ` · ${sala.nombre}` : ''}
                </p>
                <p style={{ fontSize: 12, color: t.muted }}>{instr.rol === 'PROPIETARIO' ? 'Directora' : 'Instructora'}</p>
              </div>
            </div>
          )}

          {/* Info row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '16px 0', borderBottom: `1px solid ${t.line}` }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.muted, marginBottom: 4 }}>
                <Clock size={13} />
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Horario</span>
              </div>
              <p style={{ fontSize: 14, fontWeight: 800, color: t.ink }}>{formatTime(ses.inicio)}–{formatTime(ses.fin)}</p>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.muted, marginBottom: 4 }}>
                <Users size={13} />
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Plazas</span>
              </div>
              <p style={{ fontSize: 14, fontWeight: 800, color: libres <= 2 && libres > 0 ? '#D97706' : libres === 0 ? '#EF4444' : t.ink }}>
                {libres > 0 ? `${libres} libre${libres !== 1 ? 's' : ''}` : 'Completo'}
              </p>
            </div>
          </div>

          <div style={{ padding: '16px 0', borderBottom: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: t.muted2 }}>
            <MapPin size={13} style={{ color: t.muted, flexShrink: 0 }} />
            <span style={{ textTransform: 'capitalize' }}>{formatDayFull(ses.inicio)}</span>
            {sala && <span>· {sala.nombre}</span>}
          </div>

          {/* Sobre la clase */}
          {tipo?.descripcion && (
            <div style={{ paddingTop: 16 }}>
              <p style={{ ...microLabel, marginBottom: 8 }}>Sobre la clase</p>
              <p style={{ fontSize: 14, color: t.muted2, lineHeight: 1.5 }}>{tipo.descripcion}</p>
            </div>
          )}

          {/* Reservada badge */}
          {miReserva && (
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, borderRadius: 18, padding: '12px 16px', backgroundColor: miReserva.estado === 'CONFIRMADA' ? 'rgba(62,155,108,0.12)' : 'rgba(217,119,6,0.12)' }}>
              {miReserva.estado === 'CONFIRMADA'
                ? <CheckCircle size={15} style={{ color: '#3E9B6C', flexShrink: 0 }} />
                : <AlertCircle size={15} style={{ color: '#D97706', flexShrink: 0 }} />}
              <p style={{ fontSize: 13, fontWeight: 700, color: miReserva.estado === 'CONFIRMADA' ? '#3E9B6C' : '#D97706' }}>
                {miReserva.estado === 'CONFIRMADA' ? 'Ya tienes esta clase reservada' : 'Estás en lista de espera'}
              </p>
            </div>
          )}
        </div>

        {/* Acción */}
        <div style={{ marginTop: 20 }}>
          {miReserva ? (
            <button
              onClick={() => cancelarReserva(miReserva.id)}
              style={{ width: '100%', fontSize: 14, fontWeight: 800, color: '#EF4444', padding: '14px 0', borderRadius: 18, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent' }}
            >
              Cancelar reserva
            </button>
          ) : (
            <button
              onClick={() => session?.socioId && addReserva(ses.id, session.socioId)}
              style={{ width: '100%', fontSize: 15, fontWeight: 800, textTransform: 'uppercase', padding: '14px 0', borderRadius: 18, color: t.accentInk, border: 'none', backgroundColor: 'var(--portal-brand)' }}
            >
              {libres > 0
                ? (cubierta || precioClaseSuelta == null ? 'Reservar' : `Reservar · ${precioClaseSuelta} €`)
                : 'Unirme a la lista de espera'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

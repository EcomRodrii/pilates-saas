'use client';

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { ChevronLeft, Clock, Users, MapPin, BarChart2, CheckCircle, AlertCircle } from 'lucide-react';

const NIVEL_LABEL: Record<string, string> = {
  TODOS: 'Todos los niveles', PRINCIPIANTE: 'Iniciación', MEDIO: 'Intermedio', AVANZADO: 'Avanzado',
};

export default function ClaseDetallePage() {
  const router = useRouter();
  const { slug, sesionId } = useParams<{ slug: string; sesionId: string }>();
  const { session } = usePortalAuth();
  const { sesiones, reservas, tiposClase, salas, instructores, planesTarifa, addReserva, cancelarReserva } = useStudio();

  const ses = sesiones.find(s => s.id === sesionId);
  const tipo = ses ? tiposClase.find(t => t.id === ses.tipoClaseId) : undefined;
  const sala = ses ? salas.find(s => s.id === ses.salaId) : undefined;
  const instr = ses ? instructores.find(i => i.id === ses.instructorId) : undefined;
  const color = tipo?.color ?? 'var(--portal-brand)';

  const precioClaseSuelta = planesTarifa.find(p => p.tipo === 'PUNTUAL' && p.activo)?.precio ?? null;

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
      <div className="bg-white min-h-full flex flex-col items-center justify-center p-6 text-center">
        <p className="font-bold text-[#171717] text-[16px]">Esta clase ya no está disponible</p>
        <button
          onClick={() => router.push(`/portal/${slug}/clases`)}
          className="mt-4 text-[13px] font-bold text-portal-brand-secondary"
        >
          Volver a Clases
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-full">
      {/* Header */}
      <div className="px-5 pt-6 pb-10 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${color}ee, ${color}99)` }}>
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-white/25 flex items-center justify-center active:opacity-70"
          >
            <ChevronLeft size={18} className="text-white" />
          </button>
          <div className="w-9 h-9 rounded-full bg-white/25 flex items-center justify-center">
            <BarChart2 size={16} className="text-white" />
          </div>
        </div>
        <span className="inline-block text-[11px] font-bold uppercase tracking-widest text-white/80 bg-white/15 rounded-full px-3 py-1 mb-3">
          {NIVEL_LABEL[tipo?.nivel ?? 'TODOS']}
        </span>
        <h1 className="text-white text-[28px] font-extrabold leading-tight tracking-tight">{tipo?.nombre ?? 'Clase'}</h1>
      </div>

      <div className="px-4 -mt-5 pb-8">
        <div className="bg-white rounded-3xl shadow-lg p-5" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          {/* Instructor */}
          {instr && (
            <div className="flex items-center gap-3 pb-4 border-b border-[#F5F5F5]">
              <div className="w-11 h-11 rounded-full flex items-center justify-center font-extrabold text-white text-[15px] shrink-0" style={{ backgroundColor: instr.color }}>
                {instr.nombre.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-[#171717] truncate">
                  {instr.nombre}{sala ? ` · ${sala.nombre}` : ''}
                </p>
                <p className="text-[12px] text-[#8E8E93]">{instr.rol === 'PROPIETARIO' ? 'Directora' : 'Instructora'}</p>
              </div>
            </div>
          )}

          {/* Info row */}
          <div className="grid grid-cols-2 gap-3 py-4 border-b border-[#F5F5F5]">
            <div>
              <div className="flex items-center gap-1.5 text-[#8E8E93] mb-1">
                <Clock size={13} />
                <span className="text-[11px] font-bold uppercase tracking-wide">Horario</span>
              </div>
              <p className="text-[14px] font-bold text-[#171717]">{formatTime(ses.inicio)}–{formatTime(ses.fin)}</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[#8E8E93] mb-1">
                <Users size={13} />
                <span className="text-[11px] font-bold uppercase tracking-wide">Plazas</span>
              </div>
              <p className="text-[14px] font-bold" style={{ color: libres <= 2 && libres > 0 ? '#D97706' : libres === 0 ? '#EF4444' : '#171717' }}>
                {libres > 0 ? `${libres} libre${libres !== 1 ? 's' : ''}` : 'Completo'}
              </p>
            </div>
          </div>

          <div className="py-4 border-b border-[#F5F5F5] flex items-center gap-2 text-[13px] text-[#5A5A52]">
            <MapPin size={13} className="text-[#8E8E93] shrink-0" />
            <span className="capitalize">{formatDayFull(ses.inicio)}</span>
            {sala && <span>· {sala.nombre}</span>}
          </div>

          {/* Sobre la clase */}
          {tipo?.descripcion && (
            <div className="pt-4">
              <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest mb-2">Sobre la clase</p>
              <p className="text-[14px] text-[#3A3A32] leading-relaxed">{tipo.descripcion}</p>
            </div>
          )}

          {/* Reservada badge */}
          {miReserva && (
            <div className="mt-4 flex items-center gap-2 rounded-2xl px-4 py-3" style={{ backgroundColor: miReserva.estado === 'CONFIRMADA' ? '#ECFDF5' : '#FFFBEB' }}>
              {miReserva.estado === 'CONFIRMADA'
                ? <CheckCircle size={15} className="text-green-600 shrink-0" />
                : <AlertCircle size={15} className="text-amber-600 shrink-0" />}
              <p className="text-[13px] font-semibold" style={{ color: miReserva.estado === 'CONFIRMADA' ? '#047857' : '#92400E' }}>
                {miReserva.estado === 'CONFIRMADA' ? 'Ya tienes esta clase reservada' : 'Estás en lista de espera'}
              </p>
            </div>
          )}
        </div>

        {/* Acción */}
        <div className="mt-5">
          {miReserva ? (
            <button
              onClick={() => cancelarReserva(miReserva.id)}
              className="w-full text-[14px] font-bold text-red-500 py-3.5 rounded-2xl border border-red-100 active:opacity-70"
            >
              Cancelar reserva
            </button>
          ) : (
            <button
              onClick={() => session?.socioId && addReserva(ses.id, session.socioId)}
              className="w-full text-[15px] font-bold py-3.5 rounded-2xl text-white active:opacity-70 transition-opacity"
              style={{ backgroundColor: '#171717' }}
            >
              {libres > 0 ? (precioClaseSuelta != null ? `Reservar · ${precioClaseSuelta} €` : 'Reservar') : 'Unirme a la lista de espera'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

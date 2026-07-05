'use client';

import { useMemo, useState } from 'react';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { Clock, MapPin, User, CheckCircle, AlertCircle } from 'lucide-react';

type Tab = 'proximas' | 'mis-reservas';

export default function ClasesPage() {
  const { session } = usePortalAuth();
  const { sesiones, reservas, tiposClase, salas, instructores, addReserva, cancelarReserva } = useStudio();
  const [tab, setTab] = useState<Tab>('proximas');
  const now = new Date();

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

  return (
    <div className="bg-white min-h-full">

      {/* Header */}
      <div className="px-5 pt-6 pb-6" style={{ background: 'linear-gradient(155deg, #15161B 0%, #3A2E9E 55%, #4B3FD6 100%)' }}>
        <h1 className="text-white text-[28px] font-extrabold tracking-tight leading-tight">Clases</h1>
        <p className="text-[#C9C2FF] text-[13px] mt-0.5">{totalReservas} reservas activas</p>

        {/* Tabs */}
        <div className="flex gap-2 mt-5">
          {([['proximas', 'Todas las clases'], ['mis-reservas', 'Mis reservas']] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="px-4 py-2 rounded-2xl text-[13px] font-bold transition-all"
              style={{
                backgroundColor: tab === key ? 'white' : 'rgba(255,255,255,0.12)',
                color: tab === key ? '#6355FF' : 'rgba(255,255,255,0.7)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pt-4 pb-4 space-y-6">
        {groupedByDay.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-3xl bg-[#EEEBFF] flex items-center justify-center mb-4">
              <Clock size={28} className="text-[#6355FF]" />
            </div>
            <p className="font-bold text-[#15161B] text-[16px]">
              {tab === 'mis-reservas' ? 'Sin reservas activas' : 'Sin clases disponibles'}
            </p>
            <p className="text-[13px] text-[#8A8B94] mt-1">
              {tab === 'mis-reservas' ? 'Reserva una clase en la pestaña anterior' : 'Próximamente habrá nuevas clases'}
            </p>
          </div>
        ) : (
          groupedByDay.map(group => (
            <div key={group.dayKey}>
              <p className="text-[13px] font-bold text-[#8A8B94] mb-3">{group.label}</p>
              <div className="space-y-3">
                {group.items.map(ses => {
                  const tipo = tiposClase.find(t => t.id === ses.tipoClaseId);
                  const sala = salas.find(s => s.id === ses.salaId);
                  const instr = instructores.find(i => i.id === ses.instructorId);
                  const libres = getLibres(ses.id, ses.aforoMaximo);
                  const miReserva = getMiReserva(ses.id);
                  const color = tipo?.color ?? '#6355FF';

                  return (
                    <div key={ses.id} className="bg-white rounded-2xl shadow-sm overflow-hidden" style={{ boxShadow: '0 1px 8px rgba(0,0,0,0.08)' }}>
                      {/* Color stripe */}
                      <div className="h-1" style={{ backgroundColor: color }} />
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-extrabold text-[#15161B] text-[16px] leading-tight">{tipo?.nombre ?? 'Clase'}</p>
                            {instr && (
                              <div className="flex items-center gap-1 mt-1">
                                <User size={11} className="text-[#8A8B94]" />
                                <p className="text-[12px] text-[#71727A]">{instr.nombre}</p>
                              </div>
                            )}
                          </div>
                          {miReserva?.estado === 'CONFIRMADA' && (
                            <div className="flex items-center gap-1 bg-green-50 px-2.5 py-1 rounded-full shrink-0">
                              <CheckCircle size={11} className="text-green-600" />
                              <span className="text-[11px] font-bold text-green-700">Reservada</span>
                            </div>
                          )}
                          {miReserva?.estado === 'LISTA_ESPERA' && (
                            <div className="flex items-center gap-1 bg-amber-50 px-2.5 py-1 rounded-full shrink-0">
                              <AlertCircle size={11} className="text-amber-600" />
                              <span className="text-[11px] font-bold text-amber-700">En espera</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1.5">
                            <Clock size={12} className="text-[#8A8B94]" />
                            <span className="text-[13px] font-semibold text-[#3A3B44]">{formatTime(ses.inicio)} – {formatTime(ses.fin)}</span>
                          </div>
                          {sala && (
                            <div className="flex items-center gap-1">
                              <MapPin size={11} className="text-[#8A8B94]" />
                              <span className="text-[12px] text-[#71727A]">{sala.nombre}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#F1F1F6]">
                          <p className="text-[12px] font-medium" style={{ color: libres <= 2 && libres > 0 ? '#D97706' : libres === 0 ? '#EF4444' : '#8A8B94' }}>
                            {libres > 0 ? `${libres} plaza${libres !== 1 ? 's' : ''} libre${libres !== 1 ? 's' : ''}` : 'Aforo completo'}
                          </p>
                          {miReserva?.estado === 'CONFIRMADA' ? (
                            <button
                              onClick={() => cancelarReserva(miReserva.id)}
                              className="text-[13px] font-bold text-red-500 px-4 py-1.5 rounded-xl border border-red-100 active:opacity-70"
                            >
                              Cancelar
                            </button>
                          ) : !miReserva && (
                            <button
                              onClick={() => session?.socioId && addReserva(ses.id, session.socioId)}
                              disabled={libres <= 0}
                              className="text-[13px] font-bold px-4 py-1.5 rounded-xl text-white transition-opacity active:opacity-70 disabled:opacity-40"
                              style={{ backgroundColor: libres > 0 ? color : '#C7C8D0' }}
                            >
                              {libres > 0 ? 'Reservar' : 'Lista espera'}
                            </button>
                          )}
                        </div>
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

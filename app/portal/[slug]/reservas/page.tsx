'use client';

import { useMemo, useState } from 'react';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { Calendar, Clock, MapPin, User as UserIcon, X } from 'lucide-react';
import type { Reserva, Sesion } from '@/lib/types';

type Tab = 'PROXIMAS' | 'PASADAS' | 'CANCELADAS' | 'ESPERA';

const ESTADO_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  CONFIRMADA: { label: 'Confirmada', bg: '#ECFDF5', color: '#059669' },
  LISTA_ESPERA: { label: 'Lista de espera', bg: '#FFFBEB', color: '#D97706' },
  ASISTIDA: { label: 'Asistida', bg: '#EAF6FF', color: '#0369A1' },
  CANCELADA: { label: 'Cancelada', bg: '#F5F5F1', color: '#8E8E93' },
  NO_ASISTIO: { label: 'No asistió', bg: '#FEF2F2', color: '#DC2626' },
};

export default function MisReservasPage() {
  const { session } = usePortalAuth();
  const { reservas, sesiones, tiposClase, salas, instructores, cancelarReserva } = useStudio();
  const [tab, setTab] = useState<Tab>('PROXIMAS');
  const [cancelando, setCancelando] = useState<Reserva | null>(null);
  const socioId = session?.socioId;
  const now = new Date();

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

  return (
    <div className="bg-white min-h-full">
      {/* Header */}
      <div className="px-5 pt-6 pb-6" style={{ background: 'linear-gradient(160deg, #131313 0%, #1A1A1A 55%, #F7A6C4 100%)' }}>
        <h1 className="text-white text-[28px] font-extrabold tracking-tight">Mis reservas</h1>
        <p className="text-white/50 text-[13px] mt-0.5">Historial completo de tus clases</p>
      </div>

      <div className="px-4 pt-4 pb-6">
        {/* Tabs */}
        <div className="relative mb-4 -mx-4 px-4">
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="shrink-0 px-3.5 py-1.5 rounded-2xl text-[12px] font-bold transition-all"
                style={{
                  backgroundColor: tab === t.id ? '#171717' : '#F1F1EC',
                  color: tab === t.id ? 'white' : '#8E8E86',
                }}
              >
                {t.label}
                {porTab[t.id].length > 0 && ` (${porTab[t.id].length})`}
              </button>
            ))}
          </div>
          <div className="pointer-events-none absolute right-0 top-0 bottom-1 w-8" style={{ background: 'linear-gradient(to right, transparent, white)' }} />
        </div>

        {lista.length === 0 ? (
          <div className="rounded-2xl bg-[#F5F5F1] p-8 text-center">
            <Calendar size={28} className="text-[#C7C7CC] mx-auto mb-2" />
            <p className="text-[14px] text-[#8E8E93]">Nada por aquí todavía</p>
          </div>
        ) : (
          <div className="space-y-2">
            {lista.map(({ r, s }) => {
              const tipo = tiposClase.find(t => t.id === s.tipoClaseId);
              const sala = salas.find(x => x.id === s.salaId);
              const instr = instructores.find(i => i.id === s.instructorId);
              const badge = ESTADO_BADGE[r.estado] ?? ESTADO_BADGE.CANCELADA;
              const puedeCancel = r.estado === 'CONFIRMADA' && new Date(s.inicio) > now;
              return (
                <div key={r.id} className="bg-white rounded-2xl px-4 py-3.5" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold text-[#171717] truncate">{tipo?.nombre ?? 'Clase'}</p>
                      <p className="text-[12px] text-[#8E8E93] mt-0.5 flex items-center gap-1">
                        <Calendar size={11} /> {formatFecha(s.inicio)} <Clock size={11} className="ml-1.5" /> {formatHora(s.inicio)}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full" style={{ backgroundColor: badge.bg, color: badge.color }}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-[#8E8E93]">
                    {instr && <span className="flex items-center gap-1"><UserIcon size={11} />{instr.nombre}</span>}
                    {sala && <span className="flex items-center gap-1"><MapPin size={11} />{sala.nombre}</span>}
                  </div>
                  {puedeCancel && (
                    <button
                      onClick={() => setCancelando(r)}
                      className="mt-3 w-full py-2 rounded-xl border border-red-200 text-red-600 text-[12px] font-bold active:bg-red-50 transition-colors"
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCancelando(null)} />
          <div className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:pb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[17px] font-bold text-[#171717]">¿Cancelar esta clase?</h2>
              <button onClick={() => setCancelando(null)} className="w-8 h-8 rounded-full flex items-center justify-center bg-[#F1F1EC] text-[#8E8E86]">
                <X size={16} />
              </button>
            </div>
            <p className="text-[13px] text-[#8E8E86] mb-5">Perderás tu plaza y liberarás el hueco para otra socia.</p>
            <div className="flex gap-2">
              <button onClick={() => setCancelando(null)} className="flex-1 py-3 rounded-2xl border border-[#E7E7E0] text-[#3A3A34] text-[14px] font-semibold">
                Volver
              </button>
              <button
                onClick={() => { cancelarReserva(cancelando.id); setCancelando(null); }}
                className="flex-1 py-3 rounded-2xl bg-red-500 text-white text-[14px] font-bold active:bg-red-600 transition-colors"
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

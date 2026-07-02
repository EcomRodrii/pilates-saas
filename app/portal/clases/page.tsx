'use client';

import { useMemo, useState } from 'react';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';

type Tab = 'proximas' | 'mis-reservas';

export default function ClasesPage() {
  const { session } = usePortalAuth();
  const { sesiones, reservas, tiposClase, salas, instructores, addReserva, cancelarReserva } = useStudio();
  const [tab, setTab] = useState<Tab>('proximas');

  const now = new Date();

  const sesionesActivas = useMemo(
    () =>
      sesiones
        .filter(s => !s.cancelada && new Date(s.inicio) > now)
        .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime()),
    [sesiones]
  );

  const misReservas = useMemo(
    () => reservas.filter(r => r.socioId === session?.socioId),
    [reservas, session?.socioId]
  );

  const sesionesFiltradas = useMemo(() => {
    if (tab === 'mis-reservas') {
      const misSesionIds = new Set(
        misReservas
          .filter(r => r.estado === 'CONFIRMADA' || r.estado === 'LISTA_ESPERA')
          .map(r => r.sesionId)
      );
      return sesionesActivas.filter(s => misSesionIds.has(s.id));
    }
    return sesionesActivas;
  }, [tab, sesionesActivas, misReservas]);

  const groupedByDay = useMemo(() => {
    const groups: { dayKey: string; label: string; items: typeof sesionesFiltradas }[] = [];
    for (const sesion of sesionesFiltradas) {
      const d = new Date(sesion.inicio);
      const dayKey = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
      const last = groups[groups.length - 1];
      if (last && last.dayKey === dayKey) {
        last.items.push(sesion);
      } else {
        groups.push({ dayKey, label, items: [sesion] });
      }
    }
    return groups;
  }, [sesionesFiltradas]);

  function getMiReserva(sesionId: string) {
    return misReservas.find(
      r =>
        r.sesionId === sesionId &&
        (r.estado === 'CONFIRMADA' || r.estado === 'LISTA_ESPERA')
    ) ?? null;
  }

  function getConfirmadasCount(sesionId: string) {
    return reservas.filter(r => r.sesionId === sesionId && r.estado === 'CONFIRMADA').length;
  }

  function handleReservar(sesionId: string) {
    if (!session?.socioId) return;
    addReserva(sesionId, session.socioId);
  }

  function handleCancelar(reservaId: string) {
    cancelarReserva(reservaId);
  }

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <div className="px-4 pt-5 pb-6 space-y-4">
      <h1 className="text-xl font-extrabold text-[#111827]">Clases</h1>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {(
          [
            { key: 'proximas', label: 'Próximas' },
            { key: 'mis-reservas', label: 'Mis reservas' },
          ] as { key: Tab; label: string }[]
        ).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
              tab === t.key
                ? 'bg-[#4F46E5] text-white'
                : 'bg-white border border-[#E8EAED] text-[#6B7280]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {groupedByDay.length === 0 ? (
        <div className="bg-white border border-dashed border-[#D1D5DB] rounded-2xl p-8 text-center mt-6">
          <p className="text-sm text-[#6B7280]">
            {tab === 'mis-reservas'
              ? 'No tienes reservas próximas'
              : 'No hay sesiones disponibles próximamente'}
          </p>
        </div>
      ) : (
        groupedByDay.map(group => (
          <div key={group.dayKey} className="space-y-3">
            <p className="text-xs font-extrabold uppercase tracking-widest text-[#9CA3AF]">
              {capitalizeFirst(group.label)}
            </p>
            {group.items.map(sesion => {
              const tipo = tiposClase.find(t => t.id === sesion.tipoClaseId);
              const sala = salas.find(s => s.id === sesion.salaId);
              const instructor = instructores.find(i => i.id === sesion.instructorId);
              const confirmadas = getConfirmadasCount(sesion.id);
              const libres = sesion.aforoMaximo - confirmadas;
              const miReserva = getMiReserva(sesion.id);
              const llena = libres <= 0;

              return (
                <div
                  key={sesion.id}
                  className="bg-white border border-[#E8EAED] rounded-2xl p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {tipo?.color && (
                        <span
                          className="shrink-0 w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: tipo.color }}
                        />
                      )}
                      <p className="font-bold text-[#111827] truncate">
                        {tipo?.nombre ?? 'Clase'}
                      </p>
                    </div>
                    {miReserva?.estado === 'CONFIRMADA' && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-[#D1FAE5] text-[#065F46] text-xs font-semibold">
                        Reservada
                      </span>
                    )}
                    {miReserva?.estado === 'LISTA_ESPERA' && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] text-xs font-semibold">
                        Lista de espera
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 text-xs text-[#6B7280]">
                    <p>
                      {formatTime(sesion.inicio)} – {formatTime(sesion.fin)}
                      {sala && <span> · {sala.nombre}</span>}
                    </p>
                    {instructor && (
                      <p>
                        con {instructor.nombre}
                      </p>
                    )}
                    <p className={libres === 0 ? 'text-[#EF4444] font-semibold' : ''}>
                      {libres > 0 ? `${libres} plaza${libres !== 1 ? 's' : ''} libre${libres !== 1 ? 's' : ''}` : 'Aforo completo'}
                    </p>
                  </div>

                  <div className="flex justify-end">
                    {miReserva?.estado === 'CONFIRMADA' ? (
                      <button
                        onClick={() => handleCancelar(miReserva.id)}
                        className="rounded-xl px-3 py-1.5 text-xs font-semibold border border-[#E8EAED] text-[#EF4444] bg-white active:opacity-70 transition-opacity"
                      >
                        Cancelar
                      </button>
                    ) : miReserva?.estado === 'LISTA_ESPERA' ? null : (
                      <button
                        onClick={() => handleReservar(sesion.id)}
                        disabled={llena}
                        className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-opacity ${
                          llena
                            ? 'bg-[#F3F4F6] text-[#9CA3AF] cursor-not-allowed'
                            : 'bg-[#4F46E5] text-white active:opacity-70'
                        }`}
                      >
                        Reservar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { tieneCoberturaPlan } from '@/lib/portal-home-logic';
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

  return (
    <div className="bg-white min-h-full">

      {/* Header */}
      <div className="px-5 pt-6 pb-6" style={{ background: 'linear-gradient(160deg, #131313 0%, #1A1A1A 55%, var(--portal-brand) 100%)' }}>
        <h1 className="text-white text-[28px] font-extrabold tracking-tight leading-tight">Clases</h1>
        <p className="text-white/50 text-[13px] mt-0.5">{totalReservas} reservas activas</p>

        {/* Tabs */}
        <div className="flex gap-2 mt-5">
          {([['proximas', 'Todas las clases'], ['mis-reservas', 'Mis reservas']] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="px-4 py-2 rounded-2xl text-[13px] font-bold transition-all"
              style={{
                backgroundColor: tab === key ? 'white' : 'rgba(255,255,255,0.12)',
                color: tab === key ? '#171717' : 'rgba(255,255,255,0.7)',
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
            <div className="w-16 h-16 rounded-3xl bg-portal-brand/10 flex items-center justify-center mb-4">
              <Clock size={28} className="text-portal-brand-secondary" />
            </div>
            <p className="font-bold text-[#171717] text-[16px]">
              {tab === 'mis-reservas' ? 'Sin reservas activas' : 'Sin clases disponibles'}
            </p>
            <p className="text-[13px] text-[#8E8E93] mt-1">
              {tab === 'mis-reservas' ? 'Reserva una clase en la pestaña anterior' : 'Próximamente habrá nuevas clases'}
            </p>
          </div>
        ) : (
          groupedByDay.map(group => (
            <div key={group.dayKey}>
              <p className="text-[13px] font-bold text-[#8E8E93] mb-3">{group.label}</p>
              <div className="space-y-3">
                {group.items.map(ses => {
                  const tipo = tiposClase.find(t => t.id === ses.tipoClaseId);
                  const sala = salas.find(s => s.id === ses.salaId);
                  const instr = instructores.find(i => i.id === ses.instructorId);
                  const libres = getLibres(ses.id, ses.aforoMaximo);
                  const miReserva = getMiReserva(ses.id);
                  const color = tipo?.color ?? 'var(--portal-brand)';

                  return (
                    <div key={ses.id} className="bg-white rounded-3xl overflow-hidden" style={{ boxShadow: '0 1px 8px rgba(0,0,0,0.08)' }}>
                      <Link href={`/portal/${slug}/clases/${ses.id}`} className="block active:opacity-90 transition-opacity">
                        {/* Foto (o bloque de color de respaldo) */}
                        <div className="relative h-36">
                          {tipo?.fotoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={tipo.fotoUrl} alt={tipo.nombre} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: color }}>
                              <BarChart2 size={28} className="text-white/40" />
                            </div>
                          )}
                          {!cubierta && precioClaseSuelta != null && (
                            <span className="absolute top-3 left-3 bg-black/70 text-white text-[12px] font-bold px-3 py-1 rounded-full">
                              {precioClaseSuelta} €
                            </span>
                          )}
                          {miReserva?.estado === 'CONFIRMADA' && (
                            <div className="absolute top-3 right-3 flex items-center gap-1 bg-white px-2.5 py-1 rounded-full shadow">
                              <CheckCircle size={11} className="text-green-600" />
                              <span className="text-[11px] font-bold text-green-700">Reservada</span>
                            </div>
                          )}
                          {miReserva?.estado === 'LISTA_ESPERA' && (
                            <div className="absolute top-3 right-3 flex items-center gap-1 bg-white px-2.5 py-1 rounded-full shadow">
                              <AlertCircle size={11} className="text-amber-600" />
                              <span className="text-[11px] font-bold text-amber-700">En espera</span>
                            </div>
                          )}
                        </div>

                        <div className="px-4 pt-4">
                          <p className="text-[13px] font-semibold text-[#8E8E93] mb-1">
                            {formatTime(ses.inicio)} – {formatTime(ses.fin)}
                          </p>
                          <p className="font-extrabold text-[#171717] text-[19px] leading-tight mb-3">{tipo?.nombre ?? 'Clase'}</p>

                          <div className="flex flex-wrap items-center gap-2 mb-4">
                            <span
                              className="flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-full"
                              style={{
                                backgroundColor: libres === 0 ? '#FEE2E2' : libres <= 2 ? '#FEF3C7' : '#F1F1EC',
                                color: libres === 0 ? '#DC2626' : libres <= 2 ? '#B45309' : '#3A3A32',
                              }}
                            >
                              <Users size={13} />
                              {libres > 0 ? `${libres} ${libres === 1 ? 'plaza' : 'plazas'}` : 'Completo'}
                            </span>
                            {sala && (
                              <span className="flex items-center gap-1.5 bg-[#F1F1EC] text-[#3A3A32] text-[12.5px] font-semibold px-3 py-1.5 rounded-full">
                                <MapPin size={13} />
                                {sala.nombre}
                              </span>
                            )}
                            <span
                              className="text-[12.5px] font-bold text-white px-3 py-1.5 rounded-full"
                              style={{ backgroundColor: NIVEL_COLOR[tipo?.nivel ?? 'TODOS'] }}
                            >
                              {NIVEL_LABEL[tipo?.nivel ?? 'TODOS']}
                            </span>
                          </div>

                          {instr && (
                            <div className="flex items-center gap-2.5 pb-4 mb-1 border-b border-[#F5F5F5]">
                              <div
                                className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0"
                                style={{ backgroundColor: instr.color }}
                              >
                                {instr.nombre.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-[13.5px] font-bold text-[#171717] leading-tight truncate">{instr.nombre}</p>
                                <p className="text-[11.5px] text-[#8E8E93]">{instr.rol === 'PROPIETARIO' ? 'Directora' : 'Instructora'}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </Link>

                      <div className="px-4 pb-4 pt-3">
                        {miReserva?.estado === 'CONFIRMADA' ? (
                          <button
                            onClick={() => cancelarReserva(miReserva.id)}
                            className="w-full text-[13px] font-bold text-red-500 py-2.5 rounded-2xl border border-red-100 active:opacity-70"
                          >
                            Cancelar reserva
                          </button>
                        ) : !miReserva && (
                          <button
                            onClick={() => session?.socioId && addReserva(ses.id, session.socioId)}
                            disabled={libres <= 0}
                            className="w-full text-[14px] font-bold py-2.5 rounded-2xl text-white transition-opacity active:opacity-70 disabled:opacity-40"
                            style={{ backgroundColor: libres > 0 ? '#171717' : '#C7C7CC' }}
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

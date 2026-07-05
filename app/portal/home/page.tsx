'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { Calendar, CreditCard, Play, TrendingUp, Clock, ChevronRight, Zap, AlertCircle } from 'lucide-react';

export default function PortalHome() {
  const { session, logout } = usePortalAuth();
  const { socios, suscripciones, planesTarifa, sesiones, reservas, tiposClase, salas, instructores } = useStudio();

  const socio = socios.find(s => s.id === session?.socioId);
  const activeSus = suscripciones.find(s => s.socioId === session?.socioId && s.estado === 'ACTIVA');
  const plan = activeSus ? planesTarifa.find(p => p.id === activeSus.planId) : null;
  const now = new Date();
  const bonoCaducado = !!(activeSus?.fechaFin && activeSus.fechaFin < now.toISOString().slice(0, 10));

  const misReservas = useMemo(() =>
    reservas.filter(r => r.socioId === session?.socioId), [reservas, session?.socioId]);

  const proxima = useMemo(() =>
    misReservas
      .filter(r => r.estado === 'CONFIRMADA')
      .map(r => ({ r, s: sesiones.find(s => s.id === r.sesionId) }))
      .filter(x => x.s && new Date(x.s.inicio) > now)
      .sort((a, b) => new Date(a.s!.inicio).getTime() - new Date(b.s!.inicio).getTime())[0] ?? null,
  [misReservas, sesiones]);

  const totalAsistidas = misReservas.filter(r => r.estado === 'ASISTIDA').length;
  const clasesEsteMes = useMemo(() => {
    const mes = now.getMonth(); const año = now.getFullYear();
    return misReservas.filter(r => {
      if (r.estado !== 'ASISTIDA') return false;
      const s = sesiones.find(x => x.id === r.sesionId);
      if (!s) return false;
      const d = new Date(s.inicio);
      return d.getMonth() === mes && d.getFullYear() === año;
    }).length;
  }, [misReservas, sesiones]);

  const h = now.getHours();
  const greeting = h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
  const nombre = socio?.nombre ?? session?.nombre.split(' ')[0] ?? '';
  const initials = (session?.nombre ?? '').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const formatDayShort = (iso: string) =>
    new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="bg-white min-h-full">

      {/* ── Header gradient ─────────────────────────── */}
      <div
        className="px-5 pt-6 pb-8"
        style={{ background: 'linear-gradient(160deg, #1e1b4b 0%, #312e81 60%, #A9DE20 100%)' }}
      >
        {/* Top row */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-indigo-300 text-[13px] font-medium">{greeting}</p>
            <h1 className="text-white text-[28px] font-extrabold leading-tight tracking-tight mt-0.5">
              {nombre} 👋
            </h1>
          </div>
          <button
            onClick={logout}
            className="w-11 h-11 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white text-[14px] font-bold mt-1 active:bg-white/20 transition-colors"
          >
            {initials}
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: clasesEsteMes, label: 'Este mes' },
            { value: totalAsistidas, label: 'Total' },
            {
              value: activeSus?.sesionesRestantes != null ? activeSus.sesionesRestantes : '∞',
              label: 'Restantes',
              highlight: activeSus?.sesionesRestantes != null && activeSus.sesionesRestantes <= 3,
            },
          ].map(({ value, label, highlight }) => (
            <div key={label} className="bg-white/10 rounded-2xl px-3 py-3 text-center">
              <p className={`text-[26px] font-extrabold leading-none ${highlight ? 'text-red-400' : 'text-white'}`}>
                {value}
              </p>
              <p className="text-indigo-300 text-[10px] font-semibold mt-1.5 uppercase tracking-wider">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Próxima clase ────────────────────────────── */}
      <div className="px-4 -mt-4">
        {proxima ? (() => {
          const tipo = tiposClase.find(t => t.id === proxima.s!.tipoClaseId);
          const sala = salas.find(s => s.id === proxima.s!.salaId);
          const instr = instructores.find(i => i.id === proxima.s!.instructorId);
          const color = tipo?.color ?? '#8FBF12';
          return (
            <Link href="/portal/clases" className="block rounded-3xl overflow-hidden shadow-lg active:scale-[0.98] transition-transform">
              <div className="p-5 text-white" style={{ background: `linear-gradient(135deg, ${color}ee, ${color}99)` }}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-white/60 text-[11px] font-bold uppercase tracking-widest mb-1">Próxima clase</p>
                    <p className="text-white text-[22px] font-extrabold leading-tight">{tipo?.nombre ?? 'Clase'}</p>
                    {instr && <p className="text-white/70 text-[13px] mt-0.5">con {instr.nombre}</p>}
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                    <Zap size={20} className="text-white" />
                  </div>
                </div>
                <div className="flex items-center gap-4 bg-white/15 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-1.5 text-white text-[13px] font-semibold">
                    <Clock size={14} className="text-white/70" />
                    {formatDayShort(proxima.s!.inicio)} · {formatTime(proxima.s!.inicio)}
                  </div>
                  {sala && (
                    <p className="text-white/60 text-[12px] ml-auto">{sala.nombre}</p>
                  )}
                </div>
              </div>
            </Link>
          );
        })() : (
          <Link href="/portal/clases" className="block rounded-3xl overflow-hidden shadow-lg active:scale-[0.98] transition-transform">
            <div className="p-5 bg-gradient-to-br from-[#1A1A1A] to-[#3F5200] text-white">
              <p className="text-white/60 text-[11px] font-bold uppercase tracking-widest mb-3">Próxima clase</p>
              <p className="text-white text-[20px] font-extrabold mb-1">Sin clases reservadas</p>
              <p className="text-white/60 text-[13px] mb-4">Reserva tu próxima sesión ahora</p>
              <div className="inline-flex items-center gap-2 bg-white text-[#6B8E00] text-[13px] font-bold px-4 py-2.5 rounded-2xl">
                <Calendar size={15} />
                Ver clases disponibles
              </div>
            </div>
          </Link>
        )}
      </div>

      {/* ── Mi bono ──────────────────────────────────── */}
      {plan && activeSus && (
        <div className="px-4 mt-5">
          <Link href="/portal/mi-plan" className={`block bg-white rounded-3xl shadow-sm border p-5 active:scale-[0.98] transition-transform ${bonoCaducado ? 'border-red-200' : 'border-black/[0.06]'}`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest mb-1">Mi bono</p>
                <p className="text-[18px] font-extrabold text-[#171717] leading-tight">{plan.nombre}</p>
              </div>
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${bonoCaducado ? 'bg-red-50' : 'bg-[#EDF9C8]'}`}>
                <CreditCard size={18} className={bonoCaducado ? 'text-red-500' : 'text-[#6B8E00]'} />
              </div>
            </div>
            {bonoCaducado ? (
              <div className="flex items-center gap-2 bg-red-50 rounded-2xl px-4 py-3">
                <AlertCircle size={16} className="text-red-500 shrink-0" />
                <p className="text-[13px] font-semibold text-red-700 leading-tight">
                  Caducado el {new Date(activeSus.fechaFin!).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} · renueva con tu instructor
                </p>
              </div>
            ) : activeSus.sesionesRestantes != null && plan.sesiones != null ? (
              <>
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-[22px] font-extrabold text-[#171717]">{activeSus.sesionesRestantes}</span>
                  <span className="text-[13px] text-[#8E8E93]">de {plan.sesiones} sesiones</span>
                </div>
                <div className="h-2.5 bg-[#F1F1EC] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, Math.round((activeSus.sesionesRestantes / plan.sesiones) * 100))}%`,
                      backgroundColor: activeSus.sesionesRestantes > 3 ? '#8FBF12' : '#EF4444',
                    }}
                  />
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-[14px] text-[#8E8E86]">
                  {activeSus.fechaFin
                    ? `Válido hasta el ${new Date(activeSus.fechaFin).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`
                    : 'Sesiones ilimitadas'}
                </p>
                <ChevronRight size={16} className="text-[#C7C7CC]" />
              </div>
            )}
          </Link>
        </div>
      )}

      {/* ── Acceso rápido ────────────────────────────── */}
      <div className="px-4 mt-5">
        <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest mb-3">Acceso rápido</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { href: '/portal/clases', icon: Calendar, label: 'Reservar clase', color: '#6B8E00', bg: '#EDF9C8' },
            { href: '/portal/mi-plan', icon: CreditCard, label: 'Mis pagos', color: '#059669', bg: '#ECFDF5' },
            { href: '/portal/videos', icon: Play, label: 'Videos on-demand', color: '#D97706', bg: '#FFFBEB' },
            { href: '/portal/progreso', icon: TrendingUp, label: 'Mi progreso', color: '#8FBF12', bg: '#EDF9C8' },
          ].map(({ href, icon: Icon, label, color, bg }) => (
            <Link
              key={href}
              href={href}
              className="bg-white rounded-2xl p-4 shadow-sm border border-black/[0.05] active:scale-[0.97] transition-transform flex flex-col gap-3"
            >
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ backgroundColor: bg }}>
                <Icon size={20} style={{ color }} />
              </div>
              <p className="text-[14px] font-bold text-[#171717] leading-tight">{label}</p>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}

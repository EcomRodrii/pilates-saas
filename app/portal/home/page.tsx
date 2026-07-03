'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { Calendar, CreditCard, Play, TrendingUp, ChevronRight, Flame, Clock, Zap } from 'lucide-react';

export default function PortalHome() {
  const { session, logout } = usePortalAuth();
  const { socios, suscripciones, planesTarifa, sesiones, reservas, tiposClase, salas, instructores } = useStudio();

  const socio = socios.find(s => s.id === session?.socioId);
  const activeSus = suscripciones.find(s => s.socioId === session?.socioId && s.estado === 'ACTIVA');
  const plan = activeSus ? planesTarifa.find(p => p.id === activeSus.planId) : null;
  const now = new Date();

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

  const initials = (session?.nombre ?? '')
    .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const formatDay = (iso: string) =>
    new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });

  return (
    <div className="min-h-full">

      {/* ── Hero header ──────────────────────────────────── */}
      <div className="bg-[#111827] px-5 pt-5 pb-6">
        {/* top row */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-white/40 text-[12px] font-medium">{greeting}</p>
            <h1 className="text-white text-[22px] font-extrabold leading-tight tracking-tight">{nombre} 👋</h1>
          </div>
          <button
            onClick={logout}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white text-[13px] font-bold shrink-0 active:bg-white/20 transition-colors"
          >
            {initials}
          </button>
        </div>

        {/* stat pills */}
        <div className="flex gap-2">
          <div className="flex-1 bg-white/8 rounded-2xl px-4 py-3 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
            <p className="text-white text-[22px] font-extrabold leading-none">{clasesEsteMes}</p>
            <p className="text-white/40 text-[10px] font-medium mt-1">Este mes</p>
          </div>
          <div className="flex-1 bg-white/8 rounded-2xl px-4 py-3 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
            <p className="text-white text-[22px] font-extrabold leading-none">{totalAsistidas}</p>
            <p className="text-white/40 text-[10px] font-medium mt-1">Total clases</p>
          </div>
          <div className="flex-1 bg-white/8 rounded-2xl px-4 py-3 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
            <div className="flex items-center justify-center gap-1">
              <p className="text-white text-[22px] font-extrabold leading-none">
                {activeSus?.sesionesRestantes ?? '∞'}
              </p>
              {activeSus?.sesionesRestantes != null && (
                <Flame size={14} className="text-orange-400 mb-0.5" />
              )}
            </div>
            <p className="text-white/40 text-[10px] font-medium mt-1">Sesiones</p>
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────── */}
      <div className="px-4 py-5 space-y-5">

        {/* Próxima clase */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12px] font-bold text-[#8E8E93] uppercase tracking-wider">Próxima clase</p>
            <Link href="/portal/clases" className="text-[13px] font-semibold text-[#4F46E5]">Ver todas</Link>
          </div>

          {proxima ? (() => {
            const tipo = tiposClase.find(t => t.id === proxima.s!.tipoClaseId);
            const sala = salas.find(s => s.id === proxima.s!.salaId);
            const instr = instructores.find(i => i.id === proxima.s!.instructorId);
            return (
              <Link href="/portal/clases" className="block bg-white rounded-2xl overflow-hidden active:scale-[0.98] transition-transform shadow-sm">
                <div className="h-1.5 w-full" style={{ backgroundColor: tipo?.color ?? '#4F46E5' }} />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-[#111827] text-[16px] leading-tight">{tipo?.nombre ?? 'Clase'}</p>
                      {instr && <p className="text-[13px] text-[#6B7280] mt-0.5">con {instr.nombre}</p>}
                    </div>
                    <span className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: tipo?.color ?? '#4F46E5' }}>
                      Reservada
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-3">
                    <div className="flex items-center gap-1.5 text-[13px] text-[#6B7280]">
                      <Clock size={13} className="text-[#9CA3AF]" />
                      <span className="capitalize">{formatDay(proxima.s!.inicio)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#111827]">
                      <Zap size={13} className="text-[#4F46E5]" />
                      {formatTime(proxima.s!.inicio)}
                    </div>
                    {sala && <p className="text-[13px] text-[#6B7280] ml-auto">{sala.nombre}</p>}
                  </div>
                </div>
              </Link>
            );
          })() : (
            <Link href="/portal/clases" className="block bg-white rounded-2xl p-5 text-center shadow-sm active:scale-[0.98] transition-transform">
              <div className="w-12 h-12 rounded-2xl bg-[#EEF2FF] flex items-center justify-center mx-auto mb-3">
                <Calendar size={22} className="text-[#4F46E5]" />
              </div>
              <p className="font-bold text-[#111827] text-[15px]">Sin clases reservadas</p>
              <p className="text-[13px] text-[#6B7280] mt-1 mb-3">Reserva tu próxima sesión</p>
              <span className="inline-block bg-[#4F46E5] text-white text-[13px] font-bold px-4 py-2 rounded-xl">
                Ver clases disponibles
              </span>
            </Link>
          )}
        </section>

        {/* Mi bono */}
        {plan && activeSus && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[12px] font-bold text-[#8E8E93] uppercase tracking-wider">Mi bono</p>
              <Link href="/portal/mi-plan" className="text-[13px] font-semibold text-[#4F46E5]">Detalle</Link>
            </div>
            <Link href="/portal/mi-plan" className="block bg-white rounded-2xl p-4 shadow-sm active:scale-[0.98] transition-transform">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-bold text-[#111827] text-[15px]">{plan.nombre}</p>
                  <p className="text-[12px] text-[#6B7280] mt-0.5">
                    {plan.tipo === 'MENSUAL' ? 'Suscripción mensual' : `Bono · ${plan.sesiones} clases`}
                  </p>
                </div>
                <ChevronRight size={16} className="text-[#C7C7CC]" />
              </div>
              {activeSus.sesionesRestantes != null && plan.sesiones != null ? (
                <>
                  <div className="flex justify-between text-[13px] mb-1.5">
                    <span className="font-bold text-[#111827]">{activeSus.sesionesRestantes} sesiones</span>
                    <span className="text-[#8E8E93]">de {plan.sesiones}</span>
                  </div>
                  <div className="h-2 bg-[#F2F2F7] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, Math.round((activeSus.sesionesRestantes / plan.sesiones) * 100))}%`,
                        backgroundColor: activeSus.sesionesRestantes > 3 ? '#4F46E5' : '#EF4444',
                      }}
                    />
                  </div>
                </>
              ) : (
                <p className="text-[13px] text-[#6B7280]">
                  {activeSus.fechaFin
                    ? `Válido hasta el ${new Date(activeSus.fechaFin).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`
                    : 'Activo sin límite de sesiones'}
                </p>
              )}
            </Link>
          </section>
        )}

        {/* Acceso rápido */}
        <section>
          <p className="text-[12px] font-bold text-[#8E8E93] uppercase tracking-wider mb-3">Acceso rápido</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { href: '/portal/clases', icon: Calendar, label: 'Reservar clase', color: '#4F46E5', bg: '#EEF2FF' },
              { href: '/portal/mi-plan', icon: CreditCard, label: 'Mis pagos', color: '#059669', bg: '#ECFDF5' },
              { href: '/portal/videos', icon: Play, label: 'Videos', color: '#D97706', bg: '#FFFBEB' },
              { href: '/portal/progreso', icon: TrendingUp, label: 'Progreso', color: '#9333EA', bg: '#FAF5FF' },
            ].map(item => (
              <Link
                key={item.href}
                href={item.href}
                className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm active:scale-[0.97] transition-transform"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: item.bg }}>
                  <item.icon size={18} style={{ color: item.color }} />
                </div>
                <span className="text-[14px] font-semibold text-[#111827] leading-tight">{item.label}</span>
              </Link>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}

'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { Calendar, CreditCard, Play, BarChart2, ChevronRight, Flame, Clock, MapPin } from 'lucide-react';

export default function PortalHome() {
  const { session } = usePortalAuth();
  const { socios, suscripciones, planesTarifa, sesiones, reservas, tiposClase, salas, instructores } = useStudio();

  const socio = socios.find(s => s.id === session?.socioId);
  const activeSus = suscripciones.find(s => s.socioId === session?.socioId && s.estado === 'ACTIVA');
  const plan = activeSus ? planesTarifa.find(p => p.id === activeSus.planId) : null;

  const misReservas = useMemo(() =>
    reservas.filter(r => r.socioId === session?.socioId),
    [reservas, session?.socioId]
  );

  const now = new Date();

  const proxima = useMemo(() => {
    return misReservas
      .filter(r => r.estado === 'CONFIRMADA')
      .map(r => {
        const ses = sesiones.find(s => s.id === r.sesionId);
        return ses ? { reserva: r, sesion: ses } : null;
      })
      .filter(Boolean)
      .filter(x => new Date(x!.sesion.inicio) > now)
      .sort((a, b) => new Date(a!.sesion.inicio).getTime() - new Date(b!.sesion.inicio).getTime())[0] ?? null;
  }, [misReservas, sesiones]);

  const streak = useMemo(() => {
    const asistidas = misReservas
      .filter(r => r.estado === 'ASISTIDA')
      .map(r => sesiones.find(s => s.id === r.sesionId))
      .filter(Boolean)
      .map(s => new Date(s!.inicio));

    if (!asistidas.length) return 0;

    const getWeekKey = (d: Date) => {
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
      return `${d.getFullYear()}-${week}`;
    };

    const weeks = [...new Set(asistidas.map(getWeekKey))].sort().reverse();
    const currentWeekKey = getWeekKey(now);

    let count = 0;
    let expected = currentWeekKey;

    for (const w of weeks) {
      if (w === expected) {
        count++;
        const [yr, wk] = expected.split('-').map(Number);
        expected = wk > 1 ? `${yr}-${wk - 1}` : `${yr - 1}-52`;
      } else break;
    }
    return count;
  }, [misReservas, sesiones]);

  const totalAsistidas = misReservas.filter(r => r.estado === 'ASISTIDA').length;

  const clasesEsteMes = useMemo(() => {
    const mes = now.getMonth();
    const año = now.getFullYear();
    return misReservas.filter(r => {
      if (r.estado !== 'ASISTIDA') return false;
      const ses = sesiones.find(s => s.id === r.sesionId);
      if (!ses) return false;
      const d = new Date(ses.inicio);
      return d.getMonth() === mes && d.getFullYear() === año;
    }).length;
  }, [misReservas, sesiones]);

  const greeting = () => {
    const h = now.getHours();
    if (h < 12) return 'Buenos días';
    if (h < 20) return 'Buenas tardes';
    return 'Buenas noches';
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  if (!socio) return null;

  const nombre = socio.nombre;

  return (
    <div className="space-y-5 px-4 pt-5 pb-6">
      {/* Greeting */}
      <div>
        <p className="text-sm text-[#9CA3AF]">
          {now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 className="text-2xl font-extrabold text-[#111827] mt-0.5">
          {greeting()}, {nombre}! 👋
        </h1>
      </div>

      {/* Stats / streak card */}
      <div className="bg-[#111827] rounded-3xl p-5 text-white">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-orange-500/20 flex items-center justify-center">
            <Flame size={16} className="text-orange-400" />
          </div>
          <div>
            <p className="font-bold text-base leading-none">
              {streak > 0
                ? `${streak} semana${streak !== 1 ? 's' : ''} seguida${streak !== 1 ? 's' : ''} 🔥`
                : 'Empieza tu racha'}
            </p>
            <p className="text-xs text-white/50 mt-0.5">Asistencia constante</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Clases totales', value: totalAsistidas },
            { label: 'Este mes', value: clasesEsteMes },
            { label: 'Racha (sem.)', value: streak },
          ].map(s => (
            <div key={s.label} className="bg-white/10 rounded-2xl p-3 text-center">
              <p className="text-2xl font-extrabold">{s.value}</p>
              <p className="text-[10px] text-white/50 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Próxima clase */}
      <div>
        <p className="text-xs font-extrabold uppercase tracking-widest text-[#9CA3AF] mb-2">Próxima clase</p>
        {proxima ? (
          <div className="bg-white border border-[#E8EAED] rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="font-bold text-[#111827]">
                  {tiposClase.find(t => t.id === proxima.sesion.tipoClaseId)?.nombre ?? 'Clase'}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#6B7280]">
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    {formatDate(proxima.sesion.inicio)} · {formatTime(proxima.sesion.inicio)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin size={11} />
                    {salas.find(s => s.id === proxima.sesion.salaId)?.nombre ?? ''}
                  </span>
                </div>
                {(() => {
                  const instr = instructores.find(i => i.id === proxima.sesion.instructorId);
                  return instr ? (
                    <p className="text-xs text-[#6B7280]">con {instr.nombre}</p>
                  ) : null;
                })()}
              </div>
              <Link
                href="/portal/clases"
                className="shrink-0 flex items-center gap-0.5 text-xs font-semibold text-[#4F46E5]"
              >
                Ver <ChevronRight size={12} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-dashed border-[#D1D5DB] rounded-2xl p-5 text-center">
            <p className="text-sm text-[#6B7280] mb-3">Sin clases reservadas próximamente</p>
            <Link href="/portal/clases" className="text-sm font-bold text-[#4F46E5]">
              Reservar una clase →
            </Link>
          </div>
        )}
      </div>

      {/* Mi bono */}
      {plan && activeSus ? (
        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-[#9CA3AF] mb-2">Mi bono</p>
          <div className="bg-white border border-[#E8EAED] rounded-2xl p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-bold text-[#111827]">{plan.nombre}</p>
                <p className="text-xs text-[#6B7280] mt-0.5">
                  {plan.tipo === 'MENSUAL' ? 'Suscripción mensual' : `Bono ${plan.sesiones} clases`}
                </p>
              </div>
              <Link href="/portal/mi-plan" className="text-xs font-semibold text-[#4F46E5] flex items-center gap-0.5">
                Detalle <ChevronRight size={12} />
              </Link>
            </div>
            {activeSus.sesionesRestantes != null && plan.sesiones != null ? (
              <>
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-bold text-[#111827]">{activeSus.sesionesRestantes} sesiones</span>
                  <span className="text-[#9CA3AF]">de {plan.sesiones}</span>
                </div>
                <div className="h-2.5 bg-[#F3F4F6] rounded-full overflow-hidden">
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
              <p className="text-xs text-[#6B7280]">
                {activeSus.fechaFin
                  ? `Válido hasta el ${new Date(activeSus.fechaFin).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`
                  : 'Activo sin límite'}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-[#EEF2FF] border border-[#C7D2FE] rounded-2xl p-4 text-center">
          <p className="text-sm font-bold text-[#4F46E5] mb-1">Sin plan activo</p>
          <p className="text-xs text-[#6B7280]">Contacta con el estudio para contratar un bono</p>
        </div>
      )}

      {/* Quick links */}
      <div>
        <p className="text-xs font-extrabold uppercase tracking-widest text-[#9CA3AF] mb-2">Acceso rápido</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { href: '/portal/clases', icon: Calendar, label: 'Reservar clase', bg: '#EEF2FF', color: '#4F46E5' },
            { href: '/portal/mi-plan', icon: CreditCard, label: 'Mis facturas', bg: '#F0FDF4', color: '#059669' },
            { href: '/portal/videos', icon: Play, label: 'Videos on-demand', bg: '#FEF3C7', color: '#D97706' },
            { href: '/portal/progreso', icon: BarChart2, label: 'Mi progreso', bg: '#FDF4FF', color: '#9333EA' },
          ].map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="bg-white border border-[#E8EAED] rounded-2xl p-4 flex items-center gap-3 active:scale-[0.97] transition-transform"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: item.bg }}>
                <item.icon size={16} style={{ color: item.color }} />
              </div>
              <span className="text-sm font-semibold text-[#111827]">{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

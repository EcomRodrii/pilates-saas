'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import {
  Calendar, CreditCard, Play, Clock, ChevronRight, Zap,
  AlertCircle, ListChecks, User, AlertTriangle, Coins, UserPlus, Bell,
} from 'lucide-react';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { getHomeCardContext } from '@/lib/portal-home-logic';
import { buildPortalNotifications, usePortalNotifUnreadCount } from '@/lib/portal-notifications';

export default function PortalHome() {
  const { slug } = useParams<{ slug: string }>();
  const { session } = usePortalAuth();
  const { socios, suscripciones, planesTarifa, sesiones, reservas, recibos, tiposClase, salas, instructores, saldoCreditos, rachaSocio, addReserva } = useStudio();

  const socio = socios.find(s => s.id === session?.socioId);
  const activeSus = suscripciones.find(s => s.socioId === session?.socioId && s.estado === 'ACTIVA') ?? null;
  const plan = activeSus ? planesTarifa.find(p => p.id === activeSus.planId) : null;
  const now = new Date();
  const bonoCaducado = !!(activeSus?.fechaFin && activeSus.fechaFin < now.toISOString().slice(0, 10));

  const misReservas = useMemo(() =>
    reservas.filter(r => r.socioId === session?.socioId), [reservas, session?.socioId]);

  const racha = useMemo(() => session ? rachaSocio(session.socioId) : null,
    [session, reservas, sesiones]); // eslint-disable-line react-hooks/exhaustive-deps

  const homeCard = useMemo(() => getHomeCardContext({
    now, misReservas, sesiones, tiposClase, salas, instructores, activeSus,
    racha: racha ?? { semanas: 0, enRiesgo: false, diasParaPerder: null, claveSemanaActual: '' },
  }), [now, misReservas, sesiones, tiposClase, salas, instructores, activeSus, racha]);

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

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const formatDayShort = (iso: string) =>
    new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

  // ── Notificaciones (campana) ──────────────────────
  const notifItems = useMemo(() => {
    if (!session?.socioId) return [];
    return buildPortalNotifications({ socioId: session.socioId, reservas, recibos, sesiones, tiposClase, instructores });
  }, [session?.socioId, reservas, recibos, sesiones, tiposClase, instructores]);
  const unreadCount = usePortalNotifUnreadCount(session?.socioId, notifItems);

  // ── Reserva rápida: próximos 5 días + clases del día seleccionado ──
  const proximosDias = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(now); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0);
      return d;
    });
  }, [now]);
  const [diaSeleccionado, setDiaSeleccionado] = useState(0);

  const clasesDelDia = useMemo(() => {
    const dia = proximosDias[diaSeleccionado];
    if (!dia) return [];
    const dayKey = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`;
    return sesiones
      .filter(s => !s.cancelada && s.inicio.slice(0, 10) === dayKey && new Date(s.inicio) > now)
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())
      .slice(0, 4);
  }, [proximosDias, diaSeleccionado, sesiones, now]);

  const getLibres = (sesionId: string, aforo: number) =>
    aforo - reservas.filter(r => r.sesionId === sesionId && r.estado === 'CONFIRMADA').length;
  const getMiReserva = (sesionId: string) =>
    misReservas.find(r => r.sesionId === sesionId && (r.estado === 'CONFIRMADA' || r.estado === 'LISTA_ESPERA')) ?? null;

  return (
    <div className="bg-white min-h-full">

      {/* ── Header gradient ─────────────────────────── */}
      <div
        className="px-5 pt-6 pb-8"
        style={{ background: 'linear-gradient(160deg, #131313 0%, #1A1A1A 55%, #F7A6C4 100%)' }}
      >
        {/* Top row */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-white/50 text-[13px] font-medium">{greeting}</p>
            <h1 className="text-white text-[28px] font-extrabold leading-tight tracking-tight mt-0.5">
              {nombre} 👋
            </h1>
            {racha && racha.semanas > 0 && (
              <Link
                href={`/portal/${slug}/progreso?tab=logros`}
                className="inline-flex items-center gap-1 bg-white/10 rounded-full px-2.5 py-1 mt-2 active:opacity-80 transition-opacity"
              >
                <span className="text-[13px]">🔥</span>
                <span className="text-white text-[11px] font-bold">{racha.semanas} {racha.semanas === 1 ? 'semana' : 'semanas'} seguidas</span>
              </Link>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Link
                href={`/portal/${slug}/notificaciones`}
                className="relative w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:opacity-80 transition-opacity"
              >
                <Bell size={16} className="text-white" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#F7A6C4] ring-2 ring-[#1A1A1A]" />
                )}
              </Link>
              <Link
                href={`/portal/${slug}/perfil`}
                className="rounded-full ring-2 ring-white/20 active:opacity-80 transition-opacity"
              >
                <ProfileAvatar avatarId={socio?.avatar} fotoUrl={socio?.fotoUrl} nombre={session?.nombre ?? ''} size="md" />
              </Link>
            </div>
            <Link
              href={`/portal/${slug}/progreso?tab=recompensas`}
              className="flex items-center gap-1 bg-white/10 rounded-full px-2.5 py-1 active:opacity-80 transition-opacity"
            >
              <Coins size={11} className="text-[#FFC8E2]" />
              <span className="text-white text-[11px] font-bold">{socio ? saldoCreditos(socio.id) : 0}</span>
            </Link>
          </div>
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
              <p className="text-white/50 text-[10px] font-semibold mt-1.5 uppercase tracking-wider">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Reserva rápida ───────────────────────────── */}
      <div className="px-4 -mt-4">
        <div className="bg-white rounded-3xl shadow-sm border border-black/[0.06] p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[15px] font-extrabold text-[#171717]">Reserva rápida</p>
            <Link href={`/portal/${slug}/clases`} className="flex items-center gap-0.5 text-[12px] font-bold text-[#B57A8E] active:opacity-70">
              Ver agenda <ChevronRight size={13} />
            </Link>
          </div>

          {/* Tira de días */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            {proximosDias.map((d, i) => {
              const activo = i === diaSeleccionado;
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => setDiaSeleccionado(i)}
                  className="shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-colors"
                  style={{ backgroundColor: activo ? '#171717' : '#F1F1EC' }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: activo ? 'rgba(255,255,255,0.6)' : '#A8A89E' }}>
                    {d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '')}
                  </span>
                  <span className="text-[16px] font-extrabold" style={{ color: activo ? 'white' : '#171717' }}>
                    {d.getDate()}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Clases del día */}
          <div className="mt-3 space-y-2">
            {clasesDelDia.length === 0 ? (
              <p className="text-[13px] text-[#8E8E93] py-4 text-center">Sin clases este día</p>
            ) : (
              clasesDelDia.map(ses => {
                const tipo = tiposClase.find(t => t.id === ses.tipoClaseId);
                const instr = instructores.find(i => i.id === ses.instructorId);
                const libres = getLibres(ses.id, ses.aforoMaximo);
                const miReserva = getMiReserva(ses.id);
                return (
                  <div key={ses.id} className="flex items-center gap-3 py-2 border-b border-[#F5F5F5] last:border-0">
                    <p className="text-[13px] font-bold text-[#171717] w-12 shrink-0">{formatTime(ses.inicio)}</p>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-bold text-[#171717] truncate">{tipo?.nombre ?? 'Clase'}</p>
                      <p className="text-[11.5px] text-[#8E8E93] truncate">
                        {instr?.nombre ?? ''}{instr ? ' · ' : ''}{libres > 0 ? `${libres} libre${libres !== 1 ? 's' : ''}` : 'Completo'}
                      </p>
                    </div>
                    {miReserva ? (
                      <span className="shrink-0 text-[11px] font-bold text-green-700 bg-green-50 px-3 py-1.5 rounded-xl">Reservada</span>
                    ) : (
                      <button
                        onClick={() => session?.socioId && addReserva(ses.id, session.socioId)}
                        disabled={libres <= 0}
                        className="shrink-0 text-[12px] font-bold text-white px-3.5 py-1.5 rounded-xl active:opacity-70 disabled:opacity-40 transition-opacity"
                        style={{ backgroundColor: '#171717' }}
                      >
                        Reservar
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Tarjeta principal contextual ─────────────── */}
      <div className="px-4 mt-4">
        {homeCard.caso === 'PROXIMA_CLASE' && (() => {
          const color = homeCard.tipo?.color ?? '#F7A6C4';
          return (
            <Link href={`/portal/${slug}/reservas`} className="block rounded-3xl overflow-hidden shadow-lg active:scale-[0.98] transition-transform">
              <div className="p-5 text-white" style={{ background: `linear-gradient(135deg, ${color}ee, ${color}99)` }}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-white/60 text-[11px] font-bold uppercase tracking-widest mb-1">Tu próxima clase</p>
                    <p className="text-white text-[22px] font-extrabold leading-tight">{homeCard.tipo?.nombre ?? 'Clase'}</p>
                    {homeCard.instructor && <p className="text-white/70 text-[13px] mt-0.5">con {homeCard.instructor.nombre}</p>}
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                    <Zap size={20} className="text-white" />
                  </div>
                </div>
                <div className="flex items-center gap-4 bg-white/15 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-1.5 text-white text-[13px] font-semibold">
                    <Clock size={14} className="text-white/70" />
                    {formatDayShort(homeCard.sesion.inicio)} · {formatTime(homeCard.sesion.inicio)}
                  </div>
                  {homeCard.sala && (
                    <p className="text-white/60 text-[12px] ml-auto">{homeCard.sala.nombre}</p>
                  )}
                </div>
                <p className="text-white/70 text-[12px] font-semibold mt-3 flex items-center gap-1">
                  Ver reserva <ChevronRight size={13} />
                </p>
              </div>
            </Link>
          );
        })()}

        {homeCard.caso === 'ULTIMA_SESION' && (
          <Link href={`/portal/${slug}/mi-plan`} className="block rounded-3xl overflow-hidden shadow-lg active:scale-[0.98] transition-transform">
            <div className="p-5 bg-gradient-to-br from-[#B45309] to-[#92400E] text-white">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle size={18} className="text-white" />
                <p className="text-white/70 text-[11px] font-bold uppercase tracking-widest">Último aviso</p>
              </div>
              <p className="text-white text-[20px] font-extrabold mb-1">Solo te queda una sesión del bono</p>
              <p className="text-white/70 text-[13px] mb-4">Renueva antes de perder tu plaza.</p>
              <div className="inline-flex items-center gap-2 bg-white text-[#92400E] text-[13px] font-bold px-4 py-2.5 rounded-2xl">
                Renovar
              </div>
            </div>
          </Link>
        )}

        {homeCard.caso === 'RACHA_EN_RIESGO' && (
          <Link href={`/portal/${slug}/clases`} className="block rounded-3xl overflow-hidden shadow-lg active:scale-[0.98] transition-transform">
            <div className="p-5 bg-gradient-to-br from-[#EA580C] to-[#9A3412] text-white">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[18px]">🔥</span>
                <p className="text-white/70 text-[11px] font-bold uppercase tracking-widest">Racha de {homeCard.semanas} semanas</p>
              </div>
              <p className="text-white text-[20px] font-extrabold mb-1">
                Te quedan {homeCard.diasParaPerder} {homeCard.diasParaPerder === 1 ? 'día' : 'días'} para mantener tu racha
              </p>
              <p className="text-white/70 text-[13px] mb-4">Reserva una clase esta semana para no perderla.</p>
              <div className="inline-flex items-center gap-2 bg-white text-[#9A3412] text-[13px] font-bold px-4 py-2.5 rounded-2xl">
                <Calendar size={15} />
                Reservar ahora
              </div>
            </div>
          </Link>
        )}

        {homeCard.caso === 'INACTIVA' && (
          <Link href={`/portal/${slug}/clases`} className="block rounded-3xl overflow-hidden shadow-lg active:scale-[0.98] transition-transform">
            <div className="p-5 bg-gradient-to-br from-[#1A1A1A] to-[#3A3A34] text-white">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={18} className="text-[#F7A6C4]" />
                <p className="text-white/60 text-[11px] font-bold uppercase tracking-widest">
                  {homeCard.diasSinVenir} días sin venir
                </p>
              </div>
              <p className="text-white text-[20px] font-extrabold mb-1">Hace tiempo que no entrenas</p>
              <p className="text-white/60 text-[13px] mb-4">Tenemos clases disponibles esta semana.</p>
              <div className="inline-flex items-center gap-2 bg-white text-[#1A1A1A] text-[13px] font-bold px-4 py-2.5 rounded-2xl">
                <Calendar size={15} />
                Reservar
              </div>
            </div>
          </Link>
        )}

        {homeCard.caso === 'SIN_CLASES' && (
          <Link href={`/portal/${slug}/clases`} className="block rounded-3xl overflow-hidden shadow-lg active:scale-[0.98] transition-transform">
            <div className="p-5 bg-gradient-to-br from-[#1A1A1A] to-[#B57A8E] text-white">
              <p className="text-white/60 text-[11px] font-bold uppercase tracking-widest mb-3">Próxima clase</p>
              <p className="text-white text-[20px] font-extrabold mb-1">Aún no tienes ninguna clase reservada</p>
              <p className="text-white/60 text-[13px] mb-4">Reserva tu próxima sesión ahora</p>
              <div className="inline-flex items-center gap-2 bg-white text-[#B57A8E] text-[13px] font-bold px-4 py-2.5 rounded-2xl">
                <Calendar size={15} />
                Reservar clase
              </div>
            </div>
          </Link>
        )}
      </div>

      {/* ── Mi bono ──────────────────────────────────── */}
      {plan && activeSus && (
        <div className="px-4 mt-5">
          <Link href={`/portal/${slug}/mi-plan`} className={`block bg-white rounded-3xl shadow-sm border p-5 active:scale-[0.98] transition-transform ${bonoCaducado ? 'border-red-200' : 'border-black/[0.06]'}`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest mb-1">Mi bono</p>
                <p className="text-[18px] font-extrabold text-[#171717] leading-tight">{plan.nombre}</p>
              </div>
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${bonoCaducado ? 'bg-red-50' : 'bg-[#FFF2F7]'}`}>
                <CreditCard size={18} className={bonoCaducado ? 'text-red-500' : 'text-[#B57A8E]'} />
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
                      backgroundColor: activeSus.sesionesRestantes > 3 ? '#F7A6C4' : '#EF4444',
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
            { href: `/portal/${slug}/clases`, icon: Calendar, label: 'Reservar clase', color: '#B57A8E', bg: '#FFF2F7' },
            { href: `/portal/${slug}/reservas`, icon: ListChecks, label: 'Mis reservas', color: '#0369A1', bg: '#EAF6FF' },
            { href: `/portal/${slug}/mi-plan`, icon: CreditCard, label: 'Mi plan', color: '#059669', bg: '#ECFDF5' },
            { href: `/portal/${slug}/videos`, icon: Play, label: 'Vídeos', color: '#D97706', bg: '#FFFBEB' },
            { href: `/portal/${slug}/invitar`, icon: UserPlus, label: 'Invita a una amiga', color: '#2E7D4F', bg: '#ECFDF5' },
            { href: `/portal/${slug}/perfil`, icon: User, label: 'Perfil', color: '#6D28D9', bg: '#F3EEFF' },
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

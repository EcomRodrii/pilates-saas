'use client';

// Reemplazo drop-in de app/portal/[slug]/home/page.tsx
// Rediseño "Impulso" (deportivo, data-forward) con modo día/noche.
// La CAPA DE DATOS es idéntica a la original: mismos hooks, mismos cálculos,
// mismos href y handlers. Solo cambian el markup y los estilos.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import {
  Calendar, CreditCard, Play, Clock, ChevronRight, Zap,
  AlertCircle, ListChecks, User, AlertTriangle, Coins, UserPlus, Bell,
  Sun, Moon, MapPin, QrCode, Flame,
} from 'lucide-react';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { getHomeCardContext } from '@/lib/portal-home-logic';
import { buildPortalNotifications, usePortalNotifUnreadCount } from '@/lib/portal-notifications';
import { useModo } from '@/lib/portal-modo';
import { PORTAL_VIDEOS_CONGELADO } from '@/lib/frozen-features';

export default function PortalHome() {
  const { slug } = useParams<{ slug: string }>();
  const { session } = usePortalAuth();
  const { socios, suscripciones, planesTarifa, sesiones, reservas, recibos, tiposClase, salas, instructores, saldoCreditos, rachaSocio, addReserva } = useStudio();
  const { noche, toggle, t } = useModo();

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

  const notifItems = useMemo(() => {
    if (!session?.socioId) return [];
    return buildPortalNotifications({ socioId: session.socioId, reservas, recibos, sesiones, tiposClase, instructores });
  }, [session?.socioId, reservas, recibos, sesiones, tiposClase, instructores]);
  const unreadCount = usePortalNotifUnreadCount(session?.socioId, notifItems);

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

  // ── Estilos derivados del tema ──────────────────────────────
  const accentBg = noche ? 'var(--portal-brand)' : t.ink;
  // De noche accentBg es el color de marca (varía por estudio/preset), así que
  // el texto encima debe ser el foreground de ESE preset, no el fijo de t.accentInk
  // — si no, un preset con marca oscura (ej. burgundy) queda con texto oscuro
  // sobre fondo oscuro. De día accentBg es siempre t.ink (oscuro fijo), así que
  // el t.accentInk de día (blanco fijo) sigue siendo correcto.
  const accentInk = noche ? 'var(--portal-brand-foreground)' : t.accentInk;
  const card: React.CSSProperties = { background: t.surface, border: `1px solid ${t.line}`, borderRadius: 22 };
  const microLabel: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.muted };

  return (
    <div style={{ minHeight: '100%', background: t.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ padding: '20px 20px 8px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.muted }}>{greeting}</span>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', textTransform: 'uppercase', color: t.ink, lineHeight: 1 }}>Hola, {nombre}</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <button onClick={toggle} aria-label="Cambiar tema" style={{ width: 42, height: 42, borderRadius: 13, background: t.surface, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {noche ? <Sun size={19} style={{ color: t.ink }} /> : <Moon size={19} style={{ color: t.ink }} />}
            </button>
            <Link href={`/portal/${slug}/notificaciones`} style={{ position: 'relative', width: 42, height: 42, borderRadius: 13, background: t.surface, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bell size={18} style={{ color: t.ink }} />
              {unreadCount > 0 && <span style={{ position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: 999, background: 'var(--portal-brand)', border: `1.5px solid ${t.surface}` }} />}
            </Link>
            <Link href={`/portal/${slug}/perfil`} style={{ borderRadius: 13, overflow: 'hidden' }}>
              <ProfileAvatar avatarId={socio?.avatar} fotoUrl={socio?.fotoUrl} nombre={session?.nombre ?? ''} size="md" />
            </Link>
          </div>
        </div>

        {/* ── Stats: racha grande + mes/total ── */}
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href={`/portal/${slug}/progreso?tab=logros`} style={{ flex: 1.3, ...card, padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10, textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={microLabel}>Racha</span>
              <Flame size={17} style={{ color: 'var(--portal-brand)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontSize: 42, fontWeight: 800, color: t.ink, lineHeight: 0.9 }}>{racha?.semanas ?? 0}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: t.muted }}>sem</span>
            </div>
          </Link>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ flex: 1, ...card, borderRadius: 18, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ ...microLabel, fontSize: 10.5, letterSpacing: '0.08em' }}>Mes</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: t.ink }}>{clasesEsteMes}</span>
            </div>
            <Link href={`/portal/${slug}/progreso?tab=recompensas`} style={{ flex: 1, ...card, borderRadius: 18, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textDecoration: 'none' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, ...microLabel, fontSize: 10.5, letterSpacing: '0.08em' }}><Coins size={12} style={{ color: 'var(--portal-brand)' }} />Créditos</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: t.ink }}>{socio ? saldoCreditos(socio.id) : 0}</span>
            </Link>
          </div>
        </div>

        {/* ── Tarjeta contextual ── */}
        {homeCard.caso === 'PROXIMA_CLASE' && (
          <Link href={`/portal/${slug}/reservas`} style={{ display: 'block', borderRadius: 26, overflow: 'hidden', textDecoration: 'none' }}>
            <div style={{ background: t.hero, border: `1px solid ${t.heroLine}`, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.heroAccent }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: t.heroAccent }} />Tu próxima clase
                </span>
                <Zap size={18} style={{ color: t.heroAccent }} />
              </div>
              <h3 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', textTransform: 'uppercase', color: t.heroText, lineHeight: 0.98 }}>{homeCard.tipo?.nombre ?? 'Clase'}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, fontSize: 12.5, fontWeight: 600, color: t.heroSub }}>
                {homeCard.instructor && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><User size={14} />{homeCard.instructor.nombre}</span>}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Clock size={14} />{formatDayShort(homeCard.sesion.inicio)} · {formatTime(homeCard.sesion.inicio)}</span>
                {homeCard.sala && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><MapPin size={14} />{homeCard.sala.nombre}</span>}
              </div>
              <div style={{ marginTop: 18, height: 50, borderRadius: 14, background: accentBg, color: accentInk, fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <QrCode size={17} />Ver reserva
              </div>
            </div>
          </Link>
        )}

        {homeCard.caso === 'ULTIMA_SESION' && (
          <Link href={`/portal/${slug}/mi-plan`} style={{ display: 'block', borderRadius: 26, overflow: 'hidden', textDecoration: 'none' }}>
            <div style={{ padding: 20, background: 'linear-gradient(135deg,#B45309,#92400E)', color: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><AlertCircle size={18} /><span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.75 }}>Último aviso</span></div>
              <p style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Solo te queda una sesión del bono</p>
              <p style={{ fontSize: 13, opacity: 0.75, marginBottom: 16 }}>Renueva antes de perder tu plaza.</p>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', color: '#92400E', fontSize: 13, fontWeight: 800, padding: '11px 18px', borderRadius: 14, textTransform: 'uppercase' }}>Renovar</span>
            </div>
          </Link>
        )}

        {homeCard.caso === 'RACHA_EN_RIESGO' && (
          <Link href={`/portal/${slug}/clases`} style={{ display: 'block', borderRadius: 26, overflow: 'hidden', textDecoration: 'none' }}>
            <div style={{ padding: 20, background: 'linear-gradient(135deg,#EA580C,#9A3412)', color: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><Flame size={18} /><span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.75 }}>Racha de {homeCard.semanas} semanas</span></div>
              <p style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Te quedan {homeCard.diasParaPerder} {homeCard.diasParaPerder === 1 ? 'día' : 'días'} para mantener tu racha</p>
              <p style={{ fontSize: 13, opacity: 0.75, marginBottom: 16 }}>Reserva una clase esta semana para no perderla.</p>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', color: '#9A3412', fontSize: 13, fontWeight: 800, padding: '11px 18px', borderRadius: 14, textTransform: 'uppercase' }}><Calendar size={15} />Reservar ahora</span>
            </div>
          </Link>
        )}

        {(homeCard.caso === 'INACTIVA' || homeCard.caso === 'SIN_CLASES') && (
          <Link href={`/portal/${slug}/clases`} style={{ display: 'block', borderRadius: 26, overflow: 'hidden', textDecoration: 'none' }}>
            <div style={{ background: t.hero, border: `1px solid ${t.heroLine}`, padding: 20 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.heroAccent }}>{homeCard.caso === 'INACTIVA' ? `${homeCard.diasSinVenir} días sin venir` : 'Próxima clase'}</span>
              <p style={{ fontSize: 20, fontWeight: 800, color: t.heroText, margin: '8px 0 4px', letterSpacing: '-0.01em' }}>{homeCard.caso === 'INACTIVA' ? 'Hace tiempo que no entrenas' : 'Aún no tienes ninguna clase reservada'}</p>
              <p style={{ fontSize: 13, color: t.heroSub, marginBottom: 16 }}>Tenemos clases disponibles esta semana.</p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: accentBg, color: accentInk, fontSize: 13, fontWeight: 800, padding: '12px 18px', borderRadius: 14, textTransform: 'uppercase' }}><Calendar size={15} />Reservar clase</div>
            </div>
          </Link>
        )}

        {/* ── Reserva rápida ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 15, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', color: t.ink }}>Reserva rápida</span>
            <Link href={`/portal/${slug}/clases`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12, fontWeight: 700, color: t.heroAccent }}>Ver agenda <ChevronRight size={13} /></Link>
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
            {proximosDias.map((d, i) => {
              const activo = i === diaSeleccionado;
              return (
                <button key={d.toISOString()} onClick={() => setDiaSeleccionado(i)} style={{ flex: '0 0 auto', width: 52, height: 66, borderRadius: 16, border: `1px solid ${activo ? accentBg : t.line}`, background: activo ? accentBg : t.surface, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: activo ? accentInk : t.muted }}>{d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '')}</span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: activo ? accentInk : t.ink }}>{d.getDate()}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {clasesDelDia.length === 0 ? (
              <p style={{ fontSize: 13, color: t.muted, padding: '16px 0', textAlign: 'center' }}>Sin clases este día</p>
            ) : clasesDelDia.map(ses => {
              const tipo = tiposClase.find(t2 => t2.id === ses.tipoClaseId);
              const instr = instructores.find(i => i.id === ses.instructorId);
              const libres = getLibres(ses.id, ses.aforoMaximo);
              const miReserva = getMiReserva(ses.id);
              return (
                <div key={ses.id} style={{ ...card, borderRadius: 18, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <Link href={`/portal/${slug}/clases/${ses.id}`} style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: t.ink, width: 46 }}>{formatTime(ses.inicio)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 800, color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tipo?.nombre ?? 'Clase'}</p>
                      <p style={{ fontSize: 11.5, color: t.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{instr?.nombre ?? ''}{instr ? ' · ' : ''}{libres > 0 ? `${libres} plaza${libres !== 1 ? 's' : ''}` : 'Completo'}</p>
                    </div>
                  </Link>
                  {miReserva ? (
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#3E9B6C', background: 'rgba(62,155,108,0.12)', padding: '8px 12px', borderRadius: 12, textTransform: 'uppercase' }}>Reservada</span>
                  ) : (
                    <button onClick={() => session?.socioId && addReserva(ses.id, session.socioId)} disabled={libres <= 0} style={{ fontSize: 12, fontWeight: 800, color: accentInk, background: accentBg, minHeight: 44, padding: '0 16px', borderRadius: 12, textTransform: 'uppercase', opacity: libres <= 0 ? 0.4 : 1 }}>Reservar</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Mi bono ── */}
        {plan && activeSus && (
          <Link href={`/portal/${slug}/mi-plan`} style={{ ...card, borderColor: bonoCaducado ? 'rgba(239,68,68,0.4)' : t.line, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={microLabel}>Mi bono</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: t.ink }}>{plan.nombre}</span>
              </div>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: bonoCaducado ? 'rgba(239,68,68,0.12)' : t.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CreditCard size={18} style={{ color: bonoCaducado ? '#EF4444' : t.heroAccent }} />
              </div>
            </div>
            {bonoCaducado ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(239,68,68,0.1)', borderRadius: 14, padding: '12px 14px' }}>
                <AlertCircle size={16} style={{ color: '#EF4444', flexShrink: 0 }} />
                <p style={{ fontSize: 12.5, fontWeight: 700, color: '#EF4444', lineHeight: 1.2 }}>Caducado el {new Date(activeSus.fechaFin!).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} · renueva con tu instructor</p>
              </div>
            ) : activeSus.sesionesRestantes != null && plan.sesiones != null ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: t.muted }}><span style={{ fontSize: 22, fontWeight: 800, color: t.ink }}>{activeSus.sesionesRestantes}</span> / {plan.sesiones}</span>
                  <span style={{ fontSize: 12, color: t.muted }}>sesiones restantes</span>
                </div>
                <div style={{ height: 8, background: t.bar, borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, Math.round((activeSus.sesionesRestantes / plan.sesiones) * 100))}%`, height: '100%', borderRadius: 999, background: activeSus.sesionesRestantes > 3 ? 'var(--portal-brand)' : '#EF4444' }} />
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontSize: 13.5, color: t.muted }}>{activeSus.fechaFin ? `Válido hasta el ${new Date(activeSus.fechaFin).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}` : 'Sesiones ilimitadas'}</p>
                <ChevronRight size={16} style={{ color: t.muted }} />
              </div>
            )}
          </Link>
        )}

        {/* ── Acceso rápido ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={microLabel}>Acceso rápido</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { href: `/portal/${slug}/clases`, icon: Calendar, label: 'Reservar clase' },
              { href: `/portal/${slug}/reservas`, icon: ListChecks, label: 'Mis reservas' },
              // VOD congelado (feature-freeze PMF): sin acceso a "Vídeos" en el portal.
              ...(PORTAL_VIDEOS_CONGELADO ? [] : [{ href: `/portal/${slug}/videos`, icon: Play, label: 'Vídeos' }]),
              { href: `/portal/${slug}/invitar`, icon: UserPlus, label: 'Invita a una amiga' },
            ].map(({ href, icon: Icon, label }) => (
              <Link key={href} href={href} style={{ ...card, borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, textDecoration: 'none' }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: t.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={20} style={{ color: t.heroAccent }} />
                </div>
                <p style={{ fontSize: 14, fontWeight: 800, color: t.ink, lineHeight: 1.15 }}>{label}</p>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

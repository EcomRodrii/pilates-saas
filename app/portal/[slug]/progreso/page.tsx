'use client';

import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { calcularRacha } from '@/lib/engines/streak-engine';
import { estadoReto, calcularProgresoReto } from '@/lib/engines/challenge-engine';
import { ACHIEVEMENT_METRICS } from '@/lib/engines/achievement-engine';
import type { NivelInfo } from '@/lib/engines/level-engine';
import type { EstadoReto, RewardCatalogItem } from '@/lib/types';
import { useModo, type ModoTokens } from '@/lib/portal-modo';
import { Coins, Lock, Check, Trophy, Target, Gift } from 'lucide-react';

type Tab = 'resumen' | 'logros' | 'retos' | 'recompensas';

const TABS: { id: Tab; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'logros', label: 'Logros' },
  { id: 'retos', label: 'Retos' },
  { id: 'recompensas', label: 'Recompensas' },
];

export default function ProgresoPage() {
  const searchParams = useSearchParams();
  const { session } = usePortalAuth();
  const {
    socios, sesiones, reservas, nivelSocio,
    achievementDefinitions, achievementProgress, achievementHistory, evaluarLogrosSocio,
    challengeDefinitions, challengeProgress, evaluarRetosSocio,
    rewardCatalog, rewardRedemptions, rewardHistory, saldoCreditos, canjearRecompensa,
  } = useStudio();
  const { t } = useModo();
  const socioId = session?.socioId;
  const now = new Date();

  const [tab, setTab] = useState<Tab>('resumen');
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && TABS.some(x => x.id === t)) setTab(t as Tab);
  }, [searchParams]);

  useEffect(() => {
    if (!socioId) return;
    evaluarLogrosSocio(socioId);
    evaluarRetosSocio(socioId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socioId]);

  const socio = useMemo(() => socios.find(s => s.id === socioId) ?? null, [socios, socioId]);
  const misReservas = useMemo(() => reservas.filter(r => r.socioId === socioId), [reservas, socioId]);
  const asistidas = useMemo(() => misReservas.filter(r => r.estado === 'ASISTIDA'), [misReservas]);
  const noAsistidas = useMemo(() => misReservas.filter(r => r.estado === 'NO_ASISTIO'), [misReservas]);

  const totalAsistidas = asistidas.length;
  const tasaAsistencia = useMemo(() => {
    const total = asistidas.length + noAsistidas.length;
    return total === 0 ? 0 : Math.round((asistidas.length / total) * 100);
  }, [asistidas, noAsistidas]);

  const clasesEsteMes = useMemo(() => {
    const mes = now.getMonth(); const año = now.getFullYear();
    return asistidas.filter(r => {
      const s = sesiones.find(x => x.id === r.sesionId);
      if (!s) return false;
      const d = new Date(s.inicio);
      return d.getMonth() === mes && d.getFullYear() === año;
    }).length;
  }, [asistidas, sesiones]);

  const racha = useMemo(() => calcularRacha(misReservas, sesiones, now), [misReservas, sesiones]);

  const semanas = useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay() + 1 - (3 - i) * 7);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
      const count = asistidas.filter(r => {
        const s = sesiones.find(x => x.id === r.sesionId);
        if (!s) return false;
        const d = new Date(s.inicio);
        return d >= start && d <= end;
      }).length;
      return { label: start.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }), count };
    });
  }, [asistidas, sesiones]);

  const maxSem = Math.max(...semanas.map(s => s.count), 1);
  const initials = socio ? `${socio.nombre[0]}${socio.apellidos[0]}`.toUpperCase() : '?';
  const nivel = socioId ? nivelSocio(socioId) : null;

  if (!socio || !socioId) return null;

  return (
    <div style={{ minHeight: '100%', background: t.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ padding: '24px 20px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 48, height: 48, borderRadius: 16, background: t.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.ink, fontWeight: 800, fontSize: 16 }}>
            {initials}
          </div>
          <div>
            <p style={{ color: t.ink, fontWeight: 800, fontSize: 16, lineHeight: 1.1, textTransform: 'uppercase' }}>{socio.nombre} {socio.apellidos}</p>
            <p style={{ color: t.muted, fontSize: 12 }}>
              Socia desde {new Date(socio.fechaAlta).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            { v: totalAsistidas, l: 'Clases' },
            { v: clasesEsteMes, l: 'Este mes' },
            { v: `${racha.semanas}w`, l: 'Racha' },
            { v: `${tasaAsistencia}%`, l: 'Asist.' },
          ].map(({ v, l }) => (
            <div key={l} style={{ background: t.surface2, borderRadius: 18, padding: '12px 8px', textAlign: 'center' }}>
              <p style={{ color: t.ink, fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{v}</p>
              <p style={{ color: t.muted, fontSize: 9, fontWeight: 800, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: '0 16px' }}>
        <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 18, background: t.surface2 }}>
          {TABS.map(tb => {
            const active = tab === tb.id;
            return (
              <button
                key={tb.id}
                onClick={() => setTab(tb.id)}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 14, fontSize: 12.5, fontWeight: 800, border: 'none',
                  background: active ? t.surface : 'transparent', color: active ? t.ink : t.muted,
                }}
              >
                {tb.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '20px 16px 24px' }}>
        {tab === 'resumen' && (
          <ResumenTab t={t} nivel={nivel} semanas={semanas} maxSem={maxSem} />
        )}
        {tab === 'logros' && (
          <LogrosTab
            t={t}
            socioId={socioId}
            achievementDefinitions={achievementDefinitions}
            achievementProgress={achievementProgress}
            achievementHistory={achievementHistory}
          />
        )}
        {tab === 'retos' && (
          <RetosTab
            t={t}
            socioId={socioId}
            socio={socio}
            socios={socios}
            sesiones={sesiones}
            misReservas={misReservas}
            challengeDefinitions={challengeDefinitions}
            challengeProgress={challengeProgress}
            now={now}
          />
        )}
        {tab === 'recompensas' && (
          <RecompensasTab
            t={t}
            socioId={socioId}
            rewardCatalog={rewardCatalog}
            rewardRedemptions={rewardRedemptions}
            rewardHistory={rewardHistory}
            saldoCreditos={saldoCreditos}
            canjearRecompensa={canjearRecompensa}
          />
        )}
      </div>
    </div>
  );
}

// ─── Resumen ────────────────────────────────────────────────────────────────

function ResumenTab({ t, nivel, semanas, maxSem }: {
  t: ModoTokens;
  nivel: NivelInfo | null;
  semanas: { label: string; count: number }[];
  maxSem: number;
}) {
  const microLabel: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.muted };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {nivel?.actual && (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 20, padding: 16, backgroundColor: `${nivel.actual.color}18`, border: `1px solid ${t.line}` }}
        >
          <div
            style={{ width: 48, height: 48, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0, backgroundColor: `${nivel.actual.color}30` }}
          >
            {nivel.actual.icono}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: t.ink, lineHeight: 1.1 }}>Nivel {nivel.actual.nombre}</p>
            {nivel.siguiente ? (
              <>
                <p style={{ fontSize: 11, color: t.muted, marginTop: 2 }}>
                  {nivel.creditosParaSiguiente} créditos para {nivel.siguiente.nombre}
                </p>
                <div style={{ width: '100%', height: 6, borderRadius: 999, background: t.bar, marginTop: 6, overflow: 'hidden' }}>
                  <div
                    style={{ height: '100%', borderRadius: 999, width: `${Math.round(nivel.progreso * 100)}%`, backgroundColor: nivel.actual.color }}
                  />
                </div>
              </>
            ) : (
              <p style={{ fontSize: 11, color: t.muted, marginTop: 2 }}>Nivel máximo alcanzado</p>
            )}
          </div>
        </div>
      )}

      <div>
        <p style={{ ...microLabel, marginBottom: 12 }}>Últimas 4 semanas</p>
        <div style={{ background: t.surface, borderRadius: 20, padding: 16, border: `1px solid ${t.line}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 80 }}>
            {semanas.map((s, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: t.ink }}>{s.count}</span>
                <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', height: 52 }}>
                  <div
                    style={{
                      width: '100%', borderRadius: '10px 10px 0 0',
                      height: s.count === 0 ? 4 : Math.max(8, Math.round((s.count / maxSem) * 52)),
                      backgroundColor: s.count === 0 ? t.surface2 : 'var(--portal-brand)',
                    }}
                  />
                </div>
                <span style={{ fontSize: 10, color: t.muted, textAlign: 'center', lineHeight: 1.2 }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Logros ─────────────────────────────────────────────────────────────────

function LogrosTab({ t, socioId, achievementDefinitions, achievementProgress, achievementHistory }: {
  t: ModoTokens;
  socioId: string;
  achievementDefinitions: import('@/lib/types').AchievementDefinition[];
  achievementProgress: import('@/lib/types').AchievementProgress[];
  achievementHistory: import('@/lib/types').AchievementHistory[];
}) {
  const microLabel: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.muted };
  const misLogros = useMemo(() => {
    return achievementDefinitions
      .filter(a => a.activo)
      .map(def => ({
        def,
        progreso: achievementProgress.find(p => p.socioId === socioId && p.achievementId === def.id) ?? null,
      }))
      .sort((a, b) => {
        const aDone = a.progreso?.completado ? 1 : 0;
        const bDone = b.progreso?.completado ? 1 : 0;
        if (aDone !== bDone) return bDone - aDone;
        return (a.progreso?.progresoActual ?? 0) / a.def.umbral < (b.progreso?.progresoActual ?? 0) / b.def.umbral ? 1 : -1;
      });
  }, [achievementDefinitions, achievementProgress, socioId]);

  const historial = useMemo(() =>
    achievementHistory.filter(h => h.socioId === socioId).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)),
  [achievementHistory, socioId]);

  const desbloqueados = misLogros.filter(l => l.progreso?.completado).length;
  const formatFecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <p style={{ fontSize: 12, fontWeight: 800, color: t.heroAccent }}>{desbloqueados} de {misLogros.length} desbloqueados</p>

      {misLogros.length === 0 ? (
        <div style={{ borderRadius: 20, background: t.surface2, padding: 32, textAlign: 'center' }}>
          <Trophy size={28} style={{ color: t.muted, margin: '0 auto 8px' }} />
          <p style={{ fontSize: 14, color: t.muted }}>Tu estudio todavía no ha configurado logros.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {misLogros.map(({ def, progreso }) => {
            const completado = progreso?.completado ?? false;
            const actual = progreso?.progresoActual ?? 0;
            const porcentaje = Math.min(100, Math.round((actual / def.umbral) * 100));
            return (
              <div
                key={def.id}
                style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 20, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8, opacity: completado ? 1 : 0.7 }}
              >
                <div
                  style={{ width: 56, height: 56, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, backgroundColor: completado ? 'color-mix(in srgb, var(--portal-brand) 12%, transparent)' : t.surface2, filter: completado ? 'none' : 'grayscale(0.6)' }}
                >
                  {def.icono}
                </div>
                <p style={{ fontSize: 13, fontWeight: 800, color: t.ink, lineHeight: 1.1 }}>{def.nombre}</p>
                {!completado && (
                  <div style={{ width: '100%' }}>
                    <div style={{ height: 6, background: t.bar, borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 999, background: 'var(--portal-brand)', width: `${porcentaje}%` }} />
                    </div>
                    <p style={{ fontSize: 10, color: t.muted, marginTop: 4 }}>{actual}/{def.umbral}</p>
                  </div>
                )}
                {completado && <p style={{ fontSize: 10, fontWeight: 800, color: '#3E9B6C', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Conseguido</p>}
              </div>
            );
          })}
        </div>
      )}

      {historial.length > 0 && (
        <div>
          <p style={{ ...microLabel, marginBottom: 12 }}>Historial</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {historial.map(h => (
              <div key={h.id} style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 18, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 14, background: t.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                  {h.icono}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.nombre}</p>
                </div>
                <p style={{ fontSize: 11, color: t.muted, flexShrink: 0 }}>{formatFecha(h.creadoEn)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Retos ──────────────────────────────────────────────────────────────────

const ESTADO_STYLE: Record<EstadoReto, { label: string; bg: string; text: string }> = {
  ACTIVO: { label: 'En curso', bg: 'rgba(29,78,216,0.14)', text: '#3B82F6' },
  COMPLETADO: { label: 'Completado', bg: 'rgba(5,150,105,0.14)', text: '#3E9B6C' },
  CADUCADO: { label: 'Caducado', bg: 'rgba(142,142,147,0.14)', text: '#8E8E93' },
};

function RetosTab({ t, socioId, socio, socios, sesiones, misReservas, challengeDefinitions, challengeProgress, now }: {
  t: ModoTokens;
  socioId: string;
  socio: import('@/lib/types').Socio;
  socios: import('@/lib/types').Socio[];
  sesiones: import('@/lib/types').Sesion[];
  misReservas: import('@/lib/types').Reserva[];
  challengeDefinitions: import('@/lib/types').ChallengeDefinition[];
  challengeProgress: import('@/lib/types').ChallengeProgress[];
  now: Date;
}) {
  const retos = useMemo(() => {
    return challengeDefinitions
      .filter(c => c.activo)
      .map(c => {
        const progreso = challengeProgress.find(p => p.socioId === socioId && p.challengeId === c.id);
        const completado = progreso?.completado ?? false;
        const valor = completado
          ? progreso!.progresoActual
          : calcularProgresoReto(c, misReservas, sesiones, socio, socios, now);
        return { def: c, valor, completado, estado: estadoReto(c, completado, now) };
      })
      .sort((a, b) => {
        const orden: Record<EstadoReto, number> = { ACTIVO: 0, COMPLETADO: 1, CADUCADO: 2 };
        return orden[a.estado] - orden[b.estado] || b.def.fechaInicio.localeCompare(a.def.fechaInicio);
      });
  }, [socioId, challengeDefinitions, challengeProgress, misReservas, sesiones, socio, socios, now]);

  const metricLabel = (m: string) => ACHIEVEMENT_METRICS.find(x => x.metric === m)?.nombre ?? m;

  if (retos.length === 0) {
    return (
      <div style={{ borderRadius: 20, background: t.surface2, padding: 32, textAlign: 'center' }}>
        <Target size={28} style={{ color: t.muted, margin: '0 auto 8px' }} />
        <p style={{ fontSize: 14, color: t.muted }}>Todavía no hay retos activos. Vuelve pronto.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {retos.map(({ def, valor, estado }) => {
        const style = ESTADO_STYLE[estado];
        const pct = Math.min(100, Math.round((valor / def.objetivo) * 100));
        return (
          <div
            key={def.id}
            style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 20, padding: 16, opacity: estado === 'CADUCADO' ? 0.6 : 1 }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 16, background: t.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                {def.icono}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <p style={{ fontSize: 14, fontWeight: 800, color: t.ink }}>{def.nombre}</p>
                  <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800, flexShrink: 0, backgroundColor: style.bg, color: style.text }}>
                    {style.label}
                  </span>
                </div>
                {def.descripcion && <p style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>{def.descripcion}</p>}
                <p style={{ fontSize: 11, color: t.muted, marginTop: 4 }}>
                  {metricLabel(def.metric)} · hasta el {new Date(def.fechaFin).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                  {def.creditosRecompensa > 0 ? ` · +${def.creditosRecompensa} créditos` : ''}
                </p>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: t.muted2 }}>{Math.min(valor, def.objetivo)} / {def.objetivo}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: t.heroAccent }}>{pct}%</span>
              </div>
              <div style={{ width: '100%', height: 8, borderRadius: 999, background: t.bar, overflow: 'hidden' }}>
                <div
                  style={{ height: '100%', borderRadius: 999, width: `${pct}%`, backgroundColor: estado === 'COMPLETADO' ? '#3E9B6C' : 'var(--portal-brand)' }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Recompensas (créditos + catálogo) ───────────────────────────────────────

type EstadoTarjeta = 'DISPONIBLE' | 'BLOQUEADA' | 'CANJEADA';

function RecompensasTab({ t, socioId, rewardCatalog, rewardRedemptions, rewardHistory, saldoCreditos, canjearRecompensa }: {
  t: ModoTokens;
  socioId: string;
  rewardCatalog: import('@/lib/types').RewardCatalogItem[];
  rewardRedemptions: import('@/lib/types').RewardRedemption[];
  rewardHistory: import('@/lib/types').RewardHistory[];
  saldoCreditos: (socioId: string) => number;
  canjearRecompensa: (socioId: string, catalogItemId: string) => { ok: true } | { error: string };
}) {
  const microLabel: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.muted };
  const saldo = saldoCreditos(socioId);
  const [canjeando, setCanjeando] = useState<RewardCatalogItem | null>(null);
  const [error, setError] = useState('');
  const [exito, setExito] = useState<string | null>(null);

  const miHistorial = useMemo(() =>
    rewardHistory.filter(h => h.socioId === socioId).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)),
  [rewardHistory, socioId]);

  function estadoDe(item: RewardCatalogItem): EstadoTarjeta {
    const yaCanjeada = rewardRedemptions.some(r => r.socioId === socioId && r.catalogItemId === item.id && r.estado !== 'CANCELADO');
    if (yaCanjeada && item.stock === 0) return 'CANJEADA';
    if (saldo < item.costeCreditos) return 'BLOQUEADA';
    if (item.stock != null && item.stock <= 0) return 'BLOQUEADA';
    return 'DISPONIBLE';
  }

  function confirmarCanje() {
    if (!canjeando) return;
    const result = canjearRecompensa(socioId, canjeando.id);
    if ('error' in result) {
      setError(result.error);
    } else {
      setExito(canjeando.nombre);
      setTimeout(() => setExito(null), 2500);
    }
    setCanjeando(null);
  }

  const activos = rewardCatalog.filter(c => c.activo).sort((a, b) => a.costeCreditos - b.costeCreditos);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {exito && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 50, background: t.ink, color: t.bg, fontSize: 12, fontWeight: 700, padding: '8px 16px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Check size={13} />Has canjeado {exito}
        </div>
      )}

      {/* Wallet */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 20, padding: 16, background: 'rgba(217,119,6,0.1)' }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: t.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Coins size={18} style={{ color: '#B45309' }} />
        </div>
        <div>
          <p style={{ fontSize: 20, fontWeight: 800, color: t.ink, lineHeight: 1 }}>{saldo}</p>
          <p style={{ fontSize: 12, color: t.muted, marginTop: 4 }}>créditos disponibles</p>
        </div>
      </div>

      {/* Catálogo */}
      <div>
        <p style={{ ...microLabel, marginBottom: 12 }}>Catálogo</p>
        {activos.length === 0 ? (
          <div style={{ borderRadius: 20, background: t.surface2, padding: 32, textAlign: 'center' }}>
            <Gift size={28} style={{ color: t.muted, margin: '0 auto 8px' }} />
            <p style={{ fontSize: 14, color: t.muted }}>Todavía no hay recompensas disponibles.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {activos.map(item => {
              const estado = estadoDe(item);
              const bloqueada = estado === 'BLOQUEADA';
              const canjeada = estado === 'CANJEADA';
              return (
                <button
                  key={item.id}
                  disabled={bloqueada || canjeada}
                  onClick={() => { setError(''); setCanjeando(item); }}
                  style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 20, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, textAlign: 'left', opacity: bloqueada ? 0.55 : 1 }}
                >
                  <div style={{ width: 44, height: 44, borderRadius: 16, background: t.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                    {item.icono}
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 800, color: t.ink, lineHeight: 1.1 }}>{item.nombre}</p>
                  {item.descripcion && <p style={{ fontSize: 11, color: t.muted, lineHeight: 1.4 }}>{item.descripcion}</p>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    {canjeada ? (
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#3E9B6C', display: 'flex', alignItems: 'center', gap: 4 }}><Check size={12} />Canjeada</span>
                    ) : bloqueada ? (
                      <span style={{ fontSize: 11, fontWeight: 800, color: t.muted, display: 'flex', alignItems: 'center', gap: 4 }}><Lock size={11} />{item.costeCreditos} créditos</span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 800, color: t.heroAccent, display: 'flex', alignItems: 'center', gap: 4 }}><Coins size={11} />{item.costeCreditos} créditos</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Historial */}
      {miHistorial.length > 0 && (
        <div>
          <p style={{ ...microLabel, marginBottom: 12 }}>Historial de créditos</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {miHistorial.map(h => (
              <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 16, padding: '12px 16px', background: t.surface2 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.descripcion}</p>
                  <p style={{ fontSize: 11, color: t.muted }}>{new Date(h.creadoEn).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</p>
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#3E9B6C', flexShrink: 0 }}>+{h.creditos}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmar canje */}
      {canjeando && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} onClick={() => setCanjeando(null)} />
          <div style={{ position: 'relative', width: '100%', background: t.bg, borderRadius: '24px 24px 0 0', padding: '20px 20px 32px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: 18, background: t.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, marginBottom: 12 }}>
                {canjeando.icono}
              </div>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: t.ink }}>¿Canjear {canjeando.nombre}?</h2>
              <p style={{ fontSize: 13, color: t.muted, marginTop: 4 }}>Se descontarán {canjeando.costeCreditos} créditos de tu saldo.</p>
            </div>
            {error && <p style={{ fontSize: 13, color: '#EF4444', background: 'rgba(239,68,68,0.1)', borderRadius: 14, padding: '8px 12px', marginBottom: 12 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setCanjeando(null)} style={{ flex: 1, padding: '12px 0', borderRadius: 16, border: `1px solid ${t.line}`, color: t.muted2, fontSize: 14, fontWeight: 700, background: 'transparent' }}>
                Cancelar
              </button>
              <button onClick={confirmarCanje} style={{ flex: 1, padding: '12px 0', borderRadius: 16, background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)', fontSize: 14, fontWeight: 800, border: 'none' }}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
import { Coins, Lock, Check, Trophy, Target, Gift } from 'lucide-react';
import { cn } from '@/lib/utils';

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
    <div className="bg-white min-h-full">
      {/* Header */}
      <div className="px-5 pt-6 pb-6" style={{ background: 'linear-gradient(160deg, #131313 0%, #1A1A1A 55%, var(--portal-brand) 100%)' }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-white font-extrabold text-[16px]">
            {initials}
          </div>
          <div>
            <p className="text-white font-extrabold text-[16px] leading-tight">{socio.nombre} {socio.apellidos}</p>
            <p className="text-white/50 text-[12px]">
              Socia desde {new Date(socio.fechaAlta).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[
            { v: totalAsistidas, l: 'Clases' },
            { v: clasesEsteMes, l: 'Este mes' },
            { v: `${racha.semanas}w`, l: 'Racha' },
            { v: `${tasaAsistencia}%`, l: 'Asist.' },
          ].map(({ v, l }) => (
            <div key={l} className="bg-white/10 rounded-2xl px-2 py-3 text-center">
              <p className="text-white text-[20px] font-extrabold leading-none">{v}</p>
              <p className="text-white/50 text-[9px] font-bold mt-1 uppercase tracking-wider">{l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 pt-4">
        <div className="flex gap-1 p-1 rounded-2xl bg-[#F1F1EC]">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex-1 py-2 rounded-xl text-[12.5px] font-bold transition-all',
                tab === t.id ? 'bg-white text-[#171717] shadow-sm' : 'text-[#8E8E86]',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-5 pb-6">
        {tab === 'resumen' && (
          <ResumenTab
            nivel={nivel}
            semanas={semanas}
            maxSem={maxSem}
          />
        )}
        {tab === 'logros' && (
          <LogrosTab
            socioId={socioId}
            achievementDefinitions={achievementDefinitions}
            achievementProgress={achievementProgress}
            achievementHistory={achievementHistory}
          />
        )}
        {tab === 'retos' && (
          <RetosTab
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

function ResumenTab({ nivel, semanas, maxSem }: {
  nivel: NivelInfo | null;
  semanas: { label: string; count: number }[];
  maxSem: number;
}) {
  return (
    <div className="space-y-6">
      {nivel?.actual && (
        <div
          className="flex items-center gap-3 rounded-2xl p-4"
          style={{ backgroundColor: `${nivel.actual.color}14`, boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-[24px] shrink-0"
            style={{ backgroundColor: `${nivel.actual.color}22` }}
          >
            {nivel.actual.icono}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-extrabold text-[#171717] leading-tight">Nivel {nivel.actual.nombre}</p>
            {nivel.siguiente ? (
              <>
                <p className="text-[11px] text-[#8E8E86] mt-0.5">
                  {nivel.creditosParaSiguiente} créditos para {nivel.siguiente.nombre}
                </p>
                <div className="w-full h-1.5 rounded-full bg-black/5 mt-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.round(nivel.progreso * 100)}%`, backgroundColor: nivel.actual.color }}
                  />
                </div>
              </>
            ) : (
              <p className="text-[11px] text-[#8E8E86] mt-0.5">Nivel máximo alcanzado</p>
            )}
          </div>
        </div>
      )}

      <div>
        <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest mb-3">Últimas 4 semanas</p>
        <div className="bg-white rounded-2xl p-4 border border-black/[0.05]" style={{ boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}>
          <div className="flex items-end gap-3" style={{ height: 80 }}>
            {semanas.map((s, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[12px] font-bold text-[#171717]">{s.count}</span>
                <div className="w-full flex items-end" style={{ height: 52 }}>
                  <div
                    className="w-full rounded-t-xl transition-all"
                    style={{
                      height: s.count === 0 ? 4 : Math.max(8, Math.round((s.count / maxSem) * 52)),
                      backgroundColor: s.count === 0 ? '#F1F1EC' : 'var(--portal-brand)',
                    }}
                  />
                </div>
                <span className="text-[10px] text-[#8E8E93] text-center leading-tight">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Logros ─────────────────────────────────────────────────────────────────

function LogrosTab({ socioId, achievementDefinitions, achievementProgress, achievementHistory }: {
  socioId: string;
  achievementDefinitions: import('@/lib/types').AchievementDefinition[];
  achievementProgress: import('@/lib/types').AchievementProgress[];
  achievementHistory: import('@/lib/types').AchievementHistory[];
}) {
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
    <div className="space-y-5">
      <p className="text-[12px] font-bold text-portal-brand-secondary">{desbloqueados} de {misLogros.length} desbloqueados</p>

      {misLogros.length === 0 ? (
        <div className="rounded-2xl bg-[#F5F5F1] p-8 text-center">
          <Trophy size={28} className="text-[#C7C7CC] mx-auto mb-2" />
          <p className="text-[14px] text-[#8E8E93]">Tu estudio todavía no ha configurado logros.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {misLogros.map(({ def, progreso }) => {
            const completado = progreso?.completado ?? false;
            const actual = progreso?.progresoActual ?? 0;
            const porcentaje = Math.min(100, Math.round((actual / def.umbral) * 100));
            return (
              <div
                key={def.id}
                className="bg-white rounded-2xl border border-black/[0.06] p-4 flex flex-col items-center text-center gap-2"
                style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)', opacity: completado ? 1 : 0.7 }}
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-[26px]"
                  style={{ backgroundColor: completado ? 'color-mix(in srgb, var(--portal-brand) 10%, white)' : '#F5F5F1', filter: completado ? 'none' : 'grayscale(0.6)' }}
                >
                  {def.icono}
                </div>
                <p className="text-[13px] font-bold text-[#171717] leading-tight">{def.nombre}</p>
                {!completado && (
                  <div className="w-full">
                    <div className="h-1.5 bg-[#F1F1EC] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-portal-brand" style={{ width: `${porcentaje}%` }} />
                    </div>
                    <p className="text-[10px] text-[#A8A89E] mt-1">{actual}/{def.umbral}</p>
                  </div>
                )}
                {completado && <p className="text-[10px] font-bold text-[#059669] uppercase tracking-wide">Conseguido</p>}
              </div>
            );
          })}
        </div>
      )}

      {historial.length > 0 && (
        <div>
          <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest mb-3">Historial</p>
          <div className="space-y-2">
            {historial.map(h => (
              <div key={h.id} className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3 border border-black/[0.05]">
                <div className="w-9 h-9 rounded-xl bg-portal-brand/10 flex items-center justify-center text-[16px] shrink-0">
                  {h.icono}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#171717] truncate">{h.nombre}</p>
                </div>
                <p className="text-[11px] text-[#8E8E93] shrink-0">{formatFecha(h.creadoEn)}</p>
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
  ACTIVO: { label: 'En curso', bg: '#DBEAFE', text: '#1D4ED8' },
  COMPLETADO: { label: 'Completado', bg: '#DCFCE7', text: '#059669' },
  CADUCADO: { label: 'Caducado', bg: '#F1F1EC', text: '#8E8E86' },
};

function RetosTab({ socioId, socio, socios, sesiones, misReservas, challengeDefinitions, challengeProgress, now }: {
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
      <div className="rounded-2xl bg-[#F5F5F1] p-8 text-center">
        <Target size={28} className="text-[#C7C7CC] mx-auto mb-2" />
        <p className="text-[14px] text-[#8E8E93]">Todavía no hay retos activos. Vuelve pronto.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {retos.map(({ def, valor, estado }) => {
        const style = ESTADO_STYLE[estado];
        const pct = Math.min(100, Math.round((valor / def.objetivo) * 100));
        return (
          <div
            key={def.id}
            className="rounded-2xl p-4 border border-black/[0.05]"
            style={{ opacity: estado === 'CADUCADO' ? 0.6 : 1, boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}
          >
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-portal-brand/10 flex items-center justify-center text-[20px] shrink-0">
                {def.icono}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[14px] font-bold text-[#171717]">{def.nombre}</p>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0" style={{ backgroundColor: style.bg, color: style.text }}>
                    {style.label}
                  </span>
                </div>
                {def.descripcion && <p className="text-[12px] text-[#8E8E86] mt-0.5">{def.descripcion}</p>}
                <p className="text-[11px] text-[#A8A89F] mt-1">
                  {metricLabel(def.metric)} · hasta el {new Date(def.fechaFin).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                  {def.creditosRecompensa > 0 ? ` · +${def.creditosRecompensa} créditos` : ''}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-[#5A5A52]">{Math.min(valor, def.objetivo)} / {def.objetivo}</span>
                <span className="text-[11px] font-bold text-portal-brand-secondary">{pct}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-[#F1F1EC] overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: estado === 'COMPLETADO' ? '#059669' : 'var(--portal-brand)' }}
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

function RecompensasTab({ socioId, rewardCatalog, rewardRedemptions, rewardHistory, saldoCreditos, canjearRecompensa }: {
  socioId: string;
  rewardCatalog: import('@/lib/types').RewardCatalogItem[];
  rewardRedemptions: import('@/lib/types').RewardRedemption[];
  rewardHistory: import('@/lib/types').RewardHistory[];
  saldoCreditos: (socioId: string) => number;
  canjearRecompensa: (socioId: string, catalogItemId: string) => { ok: true } | { error: string };
}) {
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
    <div className="space-y-6">
      {exito && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#171717] text-white text-[12px] font-semibold px-4 py-2 rounded-full flex items-center gap-1.5 shadow-lg">
          <Check size={13} />Has canjeado {exito}
        </div>
      )}

      {/* Wallet */}
      <div className="flex items-center gap-3 rounded-2xl p-4 bg-[#FFFBEB]">
        <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center shrink-0">
          <Coins size={18} className="text-[#B45309]" />
        </div>
        <div>
          <p className="text-[20px] font-extrabold text-[#171717] leading-none">{saldo}</p>
          <p className="text-[12px] text-[#8E8E86] mt-1">créditos disponibles</p>
        </div>
      </div>

      {/* Catálogo */}
      <div>
        <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest mb-3">Catálogo</p>
        {activos.length === 0 ? (
          <div className="rounded-2xl bg-[#F5F5F1] p-8 text-center">
            <Gift size={28} className="text-[#C7C7CC] mx-auto mb-2" />
            <p className="text-[14px] text-[#8E8E93]">Todavía no hay recompensas disponibles.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {activos.map(item => {
              const estado = estadoDe(item);
              const bloqueada = estado === 'BLOQUEADA';
              const canjeada = estado === 'CANJEADA';
              return (
                <button
                  key={item.id}
                  disabled={bloqueada || canjeada}
                  onClick={() => { setError(''); setCanjeando(item); }}
                  className="bg-white rounded-2xl border border-black/[0.06] p-4 flex flex-col items-start gap-2 text-left active:scale-[0.97] transition-transform disabled:active:scale-100"
                  style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)', opacity: bloqueada ? 0.55 : 1 }}
                >
                  <div className="w-11 h-11 rounded-2xl bg-portal-brand/10 flex items-center justify-center text-[20px]">
                    {item.icono}
                  </div>
                  <p className="text-[14px] font-bold text-[#171717] leading-tight">{item.nombre}</p>
                  {item.descripcion && <p className="text-[11px] text-[#8E8E93] leading-snug">{item.descripcion}</p>}
                  <div className="flex items-center gap-1 mt-1">
                    {canjeada ? (
                      <span className="text-[11px] font-bold text-[#059669] flex items-center gap-1"><Check size={12} />Canjeada</span>
                    ) : bloqueada ? (
                      <span className="text-[11px] font-bold text-[#A8A89E] flex items-center gap-1"><Lock size={11} />{item.costeCreditos} créditos</span>
                    ) : (
                      <span className="text-[11px] font-bold text-portal-brand-secondary flex items-center gap-1"><Coins size={11} />{item.costeCreditos} créditos</span>
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
          <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest mb-3">Historial de créditos</p>
          <div className="space-y-2">
            {miHistorial.map(h => (
              <div key={h.id} className="flex items-center justify-between rounded-xl px-4 py-3 bg-[#F5F5F1]">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[#171717] truncate">{h.descripcion}</p>
                  <p className="text-[11px] text-[#8E8E93]">{new Date(h.creadoEn).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</p>
                </div>
                <span className="text-[13px] font-bold text-[#059669] shrink-0">+{h.creditos}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmar canje */}
      {canjeando && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCanjeando(null)} />
          <div className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:pb-6">
            <div className="flex flex-col items-center text-center mb-4">
              <div className="w-14 h-14 rounded-2xl bg-portal-brand/10 flex items-center justify-center text-[26px] mb-3">
                {canjeando.icono}
              </div>
              <h2 className="text-[17px] font-bold text-[#171717]">¿Canjear {canjeando.nombre}?</h2>
              <p className="text-[13px] text-[#8E8E86] mt-1">Se descontarán {canjeando.costeCreditos} créditos de tu saldo.</p>
            </div>
            {error && <p className="text-[13px] text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-3">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setCanjeando(null)} className="flex-1 py-3 rounded-2xl border border-[#E7E7E0] text-[#3A3A34] text-[14px] font-semibold">
                Cancelar
              </button>
              <button onClick={confirmarCanje} className="flex-1 py-3 rounded-2xl bg-portal-brand text-[#171717] text-[14px] font-bold active:scale-[0.98] transition-transform">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

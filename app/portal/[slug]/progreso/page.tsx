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
import { resumenProgreso, barrasPorSemana, claseFavorita } from '@/lib/progreso-socia';
import { display, micro, texto } from '@/lib/portal-design';
import { Coins, Lock, Check, Trophy, Target, Gift } from 'lucide-react';
import { EmptyState, BottomSheet, Button } from '@/components/portal/ui';

export default function ProgresoPage() {
  const searchParams = useSearchParams();
  const { session } = usePortalAuth();
  const {
    socios, sesiones, reservas, tiposClase, instructores, rachaSocio,
    achievementDefinitions, achievementProgress, achievementHistory, evaluarLogrosSocio,
    challengeDefinitions, challengeProgress, evaluarRetosSocio,
    rewardCatalog, rewardRedemptions, rewardHistory, saldoCreditos, canjearRecompensa,
  } = useStudio();
  const { t, noche } = useModo();
  const socioId = session?.socioId;

  // Estable durante la vida de la página: con `new Date()` suelto, cada render
  // daba una dependencia nueva y no se memoizaba nada.
  const ahora = useMemo(() => new Date(), []);

  useEffect(() => {
    if (!socioId) return;
    evaluarLogrosSocio(socioId);
    evaluarRetosSocio(socioId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socioId]);

  const socio = useMemo(() => socios.find(s => s.id === socioId) ?? null, [socios, socioId]);
  const misReservas = useMemo(() => reservas.filter(r => r.socioId === socioId), [reservas, socioId]);

  const resumen = useMemo(() => resumenProgreso(misReservas, sesiones), [misReservas, sesiones]);
  const barras = useMemo(() => barrasPorSemana(misReservas, sesiones, ahora), [misReservas, sesiones, ahora]);
  const favorita = useMemo(
    () => claseFavorita(misReservas, sesiones, tiposClase, instructores),
    [misReservas, sesiones, tiposClase, instructores]);
  const racha = useMemo(
    () => (socioId ? rachaSocio(socioId) : null),
    [socioId, reservas, sesiones]); // eslint-disable-line react-hooks/exhaustive-deps

  // Las tres secciones de gamificación solo se pintan si el estudio las tiene
  // configuradas. Medido en producción antes de decidirlo: 0 recompensas en
  // catálogo y 0 retos activos en los 11 estudios, frente a 24 logros. El
  // diseño no las dibuja, y enseñar dos pestañas vacías tampoco era la
  // respuesta — así no se pierde nada y no sobra nada.
  const hayLogros = achievementDefinitions.some(a => a.activo);
  const hayRetos = challengeDefinitions.some(c => c.activo);
  const hayRecompensas = rewardCatalog.some(r => r.activo);

  // `?tab=` lo siguen mandando enlaces del Inicio y de correos antiguos. Ya no
  // hay pestañas, así que se traduce a un desplazamiento hasta la sección.
  useEffect(() => {
    const destino = searchParams.get('tab');
    if (!destino) return;
    const el = document.getElementById(`seccion-${destino}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [searchParams]);

  const cifra = (valor: string, etiqueta: string, primera: boolean) => (
    <div key={etiqueta} style={{ flex: 1, padding: primera ? '22px 0' : '22px 0 22px 20px' }}>
      <div style={{ ...display(38), color: t.ink }}>{valor}</div>
      <div style={{ ...micro(9, 0.2), color: t.micro, marginTop: 8 }}>{etiqueta}</div>
    </div>
  );

  const encabezado = (id: string, texto1: string) => (
    <div id={id} style={{ ...micro(9.5, 0.24), color: t.micro, marginTop: 40, marginBottom: 18, scrollMarginTop: 70 }}>
      {texto1}
    </div>
  );

  return (
    <div style={{ minHeight: '100%', background: t.bg, color: t.ink }}>
      <div style={{ padding: '62px 24px 24px' }}>
        <h1 style={{ ...display(50), color: t.ink }}>Progreso</h1>
        <p style={{ ...display(19, true), color: t.muted, marginTop: 10 }}>Tu constancia, en silencio.</p>

        {/* Las tres cifras */}
        <div style={{ display: 'flex', marginTop: 34, borderTop: `1px solid ${t.line}`, borderBottom: `1px solid ${t.line}` }}>
          {cifra(String(resumen.clases), 'CLASES', true)}
          <span style={{ width: 1, background: t.line }} />
          {cifra(String(racha?.semanas ?? 0), 'SEMANAS', false)}
          <span style={{ width: 1, background: t.line }} />
          {cifra(`${resumen.horas} h`, 'EN LA SALA', false)}
        </div>

        {/* Doce semanas */}
        <div style={{ ...micro(9.5, 0.24), color: t.micro, marginTop: 34 }}>Últimas 12 semanas</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9, height: 132, marginTop: 20 }}>
          {barras.map(b => (
            <div
              key={b.semana}
              title={`${b.clases} clase${b.clases === 1 ? '' : 's'}`}
              style={{
                flex: 1, borderRadius: 6,
                // Una semana sin ir deja un hilo, no un hueco: si la barra
                // desaparece del todo, el gráfico parece que le falta un dato.
                height: `${Math.max(3, b.altura * 100)}%`,
                background: b.esteMes ? 'var(--portal-brand)' : (noche ? 'rgba(243,241,233,.18)' : 'rgba(44,53,44,.22)'),
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', marginTop: 12 }}>
          {barras.map(b => (
            <span key={b.semana} style={{ flex: 1, ...micro(9, 0.16), color: t.micro, textAlign: 'left' }}>
              {b.mes ?? ''}
            </span>
          ))}
        </div>

        {/* La clase favorita */}
        {favorita && (
          <div style={{ marginTop: 34, borderRadius: 26, background: t.surface, padding: 24, boxShadow: '0 16px 36px -28px rgba(34,42,30,.5)' }}>
            <div style={{ ...micro(8.5, 0.24, 600), color: t.heroAccent }}>Tu clase favorita</div>
            <div style={{ ...display(30, true), color: t.ink, marginTop: 12, textWrap: 'pretty' } as React.CSSProperties}>
              {favorita.nombre}
            </div>
            <div style={{ ...texto.valor, fontSize: 11.5, color: t.muted, marginTop: 10 }}>
              {favorita.veces} de tus {favorita.total} clases
              {favorita.instructoraFija ? ` · siempre con ${favorita.instructoraFija}` : ''}
            </div>
          </div>
        )}

        {/* Lo que el estudio tenga configurado, y solo eso. */}
        {hayLogros && socioId && (
          <>
            {encabezado('seccion-logros', 'Logros')}
            <LogrosTab
              t={t}
              socioId={socioId}
              achievementDefinitions={achievementDefinitions}
              achievementProgress={achievementProgress}
              achievementHistory={achievementHistory}
            />
          </>
        )}

        {hayRetos && socioId && socio && (
          <>
            {encabezado('seccion-retos', 'Retos')}
            <RetosTab
              t={t}
              socioId={socioId}
              socio={socio}
              socios={socios}
              sesiones={sesiones}
              misReservas={misReservas}
              challengeDefinitions={challengeDefinitions}
              challengeProgress={challengeProgress}
              now={ahora}
            />
          </>
        )}

        {hayRecompensas && socioId && (
          <>
            {encabezado('seccion-recompensas', 'Recompensas')}
            <RecompensasTab
              t={t}
              socioId={socioId}
              rewardCatalog={rewardCatalog}
              rewardRedemptions={rewardRedemptions}
              rewardHistory={rewardHistory}
              saldoCreditos={saldoCreditos}
              canjearRecompensa={canjearRecompensa}
            />
          </>
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
        <EmptyState icon={<Trophy size={18} />} title="Sin logros todavía" body="Tu estudio todavía no ha configurado logros." />
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
    return <EmptyState icon={<Target size={18} />} title="Sin retos activos" body="Todavía no hay retos activos. Vuelve pronto." />;
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
          <EmptyState icon={<Gift size={18} />} title="Sin recompensas todavía" body="Todavía no hay recompensas disponibles." />
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
      <BottomSheet open={!!canjeando} onClose={() => setCanjeando(null)}>
        {canjeando && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: 18, background: t.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, marginBottom: 12 }}>
                {canjeando.icono}
              </div>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: t.ink }}>¿Canjear {canjeando.nombre}?</h2>
              <p style={{ fontSize: 13, color: t.muted, marginTop: 4 }}>Se descontarán {canjeando.costeCreditos} créditos de tu saldo.</p>
            </div>
            {error && <p style={{ fontSize: 13, color: '#B85436', background: 'rgba(239,68,68,0.1)', borderRadius: 14, padding: '8px 12px' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" onClick={() => setCanjeando(null)} style={{ flex: 1 }}>Cancelar</Button>
              <Button onClick={confirmarCanje} style={{ flex: 1 }}>Confirmar</Button>
            </div>
          </>
        )}
      </BottomSheet>
    </div>
  );
}

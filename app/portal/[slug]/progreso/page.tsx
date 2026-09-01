'use client';

import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { estadoReto, calcularProgresoReto } from '@/lib/engines/challenge-engine';
import { ACHIEVEMENT_METRICS } from '@/lib/engines/achievement-engine';
import type { EstadoReto, RewardCatalogItem } from '@/lib/types';
import { resumenProgreso, barrasPorSemana, claseFavorita } from '@/lib/progreso-socia';
import { sans } from '@/lib/portal-design';
import { Coins, Lock, Check, Trophy, Target, Gift } from 'lucide-react';
import { EmptyState, BottomSheet, Button } from '@/components/portal/ui';

// ESTILOS: valores literales del sistema "Tentare Studio App" (portal-app.css,
// `.ap-*`), mismo criterio ya aplicado en portal-clases-view.tsx/portal-bonos-
// view.tsx/portal-perfil-view.tsx — en vez de los tokens de tema (`useModo()`,
// `display()`/`micro()`/`texto.*`).
//
// ⚠️ Sin captura de referencia directa para esta pantalla (las 20 capturas de
// docs/diseno-referencia-portal/ cubren Home/Horario/Reservas/Bonos/Perfil/
// Acceso/Mensajes/Estudio, ninguna es este detalle de "Progreso"). El
// tratamiento de aquí es EXTRAPOLADO por consistencia con el resto del portal
// ya convertido (mismo criterio que ya usa app/portal/[slug]/mensajes/page.tsx
// para su bandeja, que tampoco tiene captura propia) — no es un calco 1:1 de
// un diseño visto. Las 3 cifras, el gráfico de 12 semanas y la tarjeta de
// clase favorita no tienen precedente literal exacto en otra pantalla; Logros/
// Retos/Recompensas sí lo tienen (grid 2×2 de logros y barra de reto de
// portal-perfil-view.tsx, badges de 3 estados de portal-app.css) y se
// reutilizan tal cual.
//
// BottomSheet de "¿Canjear X?" (RecompensasTab): también literal, como el
// resto de hojas de confirmación del portal (ver components/portal/ui/
// BottomSheet.tsx y el sheet de "dar de baja plaza fija" de
// portal-bonos-view.tsx).

export default function ProgresoPage() {
  const searchParams = useSearchParams();
  const { session } = usePortalAuth();
  const {
    socios, sesiones, reservas, tiposClase, instructores, rachaSocio,
    achievementDefinitions, achievementProgress, achievementHistory, evaluarLogrosSocio,
    challengeDefinitions, challengeProgress, evaluarRetosSocio,
    rewardCatalog, rewardRedemptions, rewardHistory, saldoCreditos, canjearRecompensa,
  } = useStudio();
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
      <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.02em', color: '#1A1A1A', lineHeight: 1 }}>{valor}</div>
      <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: '#98A093', marginTop: 8 }}>
        {etiqueta}
      </div>
    </div>
  );

  const encabezado = (id: string, texto1: string) => (
    <div id={id} className="ap-label" style={{ marginTop: 40, marginBottom: 18, scrollMarginTop: 70 }}>
      {texto1}
    </div>
  );

  return (
    <div style={{ minHeight: '100%', background: 'var(--ap-fondo, #FAF9F5)', color: 'var(--ap-tinta, #1A1A1A)' }}>
      <div style={{ padding: '62px 24px 24px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.025em', color: '#1A1A1A' }}>Progreso</h1>
        <p style={{ fontFamily: sans, fontSize: 12, color: '#5A5A52', marginTop: 8 }}>Tu constancia, en silencio.</p>

        {/* Las tres cifras */}
        <div style={{ display: 'flex', marginTop: 34, borderTop: '1px solid #E5E3DA', borderBottom: '1px solid #E5E3DA' }}>
          {cifra(String(resumen.clases), 'CLASES', true)}
          <span style={{ width: 1, background: '#EFEDE4' }} />
          {cifra(String(racha?.semanas ?? 0), 'SEMANAS', false)}
          <span style={{ width: 1, background: '#EFEDE4' }} />
          {cifra(`${resumen.horas} h`, 'EN LA SALA', false)}
        </div>

        {/* Doce semanas */}
        <div className="ap-label" style={{ marginTop: 34 }}>Últimas 12 semanas</div>
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
                background: b.esteMes ? '#4F8A5B' : '#EFEDE4',
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', marginTop: 12 }}>
          {barras.map(b => (
            <span
              key={b.semana}
              style={{
                flex: 1, fontFamily: 'ui-monospace, monospace', fontSize: 9, letterSpacing: '.16em',
                textTransform: 'uppercase', color: '#98A093', textAlign: 'left',
              }}
            >
              {b.mes ?? ''}
            </span>
          ))}
        </div>

        {/* La clase favorita */}
        {favorita && (
          <div className="ap-card" style={{ marginTop: 34, padding: 24 }}>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 8.5, letterSpacing: '.2em', fontWeight: 600, textTransform: 'uppercase', color: '#3E6B4A' }}>
              Tu clase favorita
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, fontStyle: 'italic', letterSpacing: '-.02em', color: '#1A1A1A', marginTop: 12, textWrap: 'pretty' } as React.CSSProperties}>
              {favorita.nombre}
            </div>
            <div style={{ fontFamily: sans, fontSize: 11.5, color: '#5A5A52', marginTop: 10 }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <p style={{ fontSize: 12, fontWeight: 800, color: '#3E6B4A' }}>{desbloqueados} de {misLogros.length} desbloqueados</p>

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
                className="ap-card"
                style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8, opacity: completado ? 1 : 0.7 }}
              >
                <div
                  style={{
                    width: 56, height: 56, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
                    backgroundColor: completado ? '#EAF0E7' : '#EFEDE4',
                    filter: completado ? 'none' : 'grayscale(0.6)',
                  }}
                >
                  {def.icono}
                </div>
                <p style={{ fontSize: 13, fontWeight: 800, color: '#1A1A1A', lineHeight: 1.1 }}>{def.nombre}</p>
                {!completado && (
                  <div style={{ width: '100%' }}>
                    <div style={{ height: 6, background: '#EFEDE4', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 999, background: '#4F8A5B', width: `${porcentaje}%` }} />
                    </div>
                    <p style={{ fontSize: 10, color: '#98A093', marginTop: 4 }}>{actual}/{def.umbral}</p>
                  </div>
                )}
                {completado && (
                  <p style={{ fontSize: 10, fontWeight: 800, color: '#3E6B4A', textTransform: 'uppercase', letterSpacing: '.05em' }}>Conseguido</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {historial.length > 0 && (
        <div>
          <p className="ap-label" style={{ marginBottom: 12 }}>Historial</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {historial.map(h => (
              <div key={h.id} className="ap-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 14, background: '#EFEDE4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                  {h.icono}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.nombre}</p>
                </div>
                <p style={{ fontSize: 11, color: '#5A5A52', flexShrink: 0 }}>{formatFecha(h.creadoEn)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Retos ──────────────────────────────────────────────────────────────────

// Mismo patrón de 3 estados que `.ap-badge--ok/pocas/llena` (portal-app.css):
// EN CURSO reutiliza el verde suave de "plazas disponibles", COMPLETADO el
// verde sólido de "reservada" (`--res`) y CADUCADO la píldora neutra que ya
// usa el resto del portal para estados inactivos — en vez de inventar un azul
// y un gris nuevos que no existen en ningún otro sitio del kit.
const ESTADO_STYLE: Record<EstadoReto, { label: string; bg: string; text: string }> = {
  ACTIVO: { label: 'En curso', bg: 'var(--ap-verde-suave, #EAF0E7)', text: 'var(--ap-verde-tinta, #2E5A3A)' },
  COMPLETADO: { label: 'Completado', bg: '#4F8A5B', text: '#FFFFFF' },
  CADUCADO: { label: 'Caducado', bg: 'var(--ap-pill, #EFEDE4)', text: 'var(--ap-ter, #98A093)' },
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
            className="ap-card"
            style={{ padding: 16, opacity: estado === 'CADUCADO' ? 0.6 : 1 }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 16, background: '#EFEDE4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                {def.icono}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <p style={{ fontSize: 14, fontWeight: 800, color: '#1A1A1A' }}>{def.nombre}</p>
                  <span className="ap-badge" style={{ flexShrink: 0, backgroundColor: style.bg, color: style.text }}>
                    {style.label}
                  </span>
                </div>
                {def.descripcion && <p style={{ fontSize: 12, color: '#5A5A52', marginTop: 2 }}>{def.descripcion}</p>}
                <p style={{ fontSize: 11, color: '#5A5A52', marginTop: 4 }}>
                  {metricLabel(def.metric)} · hasta el {new Date(def.fechaFin).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                  {def.creditosRecompensa > 0 ? ` · +${def.creditosRecompensa} créditos` : ''}
                </p>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#5A5A52' }}>{Math.min(valor, def.objetivo)} / {def.objetivo}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#3E6B4A' }}>{pct}%</span>
              </div>
              {/* Mismo par ámbar (en curso) / verde (completado) que ya usa el
                  reto destacado de "Tu actividad" en portal-perfil-view.tsx. */}
              <div style={{ width: '100%', height: 8, borderRadius: 999, background: '#EFEDE4', overflow: 'hidden' }}>
                <div
                  style={{ height: '100%', borderRadius: 999, width: `${pct}%`, backgroundColor: estado === 'COMPLETADO' ? '#4F8A5B' : '#C99A3C' }}
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
  canjearRecompensa: (socioId: string, catalogItemId: string) => Promise<{ ok: true } | { error: string }>;
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

  async function confirmarCanje() {
    if (!canjeando) return;
    const nombre = canjeando.nombre;
    setCanjeando(null);
    const result = await canjearRecompensa(socioId, canjeando.id);
    if ('error' in result) {
      setError(result.error);
    } else {
      setExito(nombre);
      setTimeout(() => setExito(null), 2500);
    }
  }

  const activos = rewardCatalog.filter(c => c.activo).sort((a, b) => a.costeCreditos - b.costeCreditos);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Toast (CHEATSHEET-CSS.md): pill #1A1A1A texto #F1ECE1, top 58px. */}
      {exito && (
        <div
          style={{
            position: 'fixed', top: 58, left: '50%', transform: 'translateX(-50%)', zIndex: 50,
            background: '#1A1A1A', color: '#F1ECE1', fontSize: 12.5, fontWeight: 700, padding: '10px 18px',
            borderRadius: 999, display: 'flex', alignItems: 'center', gap: 6,
            boxShadow: '0 14px 34px -14px rgba(15,15,15,.35)',
          }}
        >
          <Check size={14} />Has canjeado {exito}
        </div>
      )}

      {/* Wallet */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 14, padding: 16, background: '#F6EEDD' }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Coins size={18} style={{ color: '#C99A3C' }} />
        </div>
        <div>
          <p style={{ fontSize: 20, fontWeight: 800, color: '#1A1A1A', lineHeight: 1 }}>{saldo}</p>
          <p style={{ fontSize: 12, color: '#5A5A52', marginTop: 4 }}>créditos disponibles</p>
        </div>
      </div>

      {/* Catálogo */}
      <div>
        <p className="ap-label" style={{ marginBottom: 12 }}>Catálogo</p>
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
                  className="ap-card"
                  style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, textAlign: 'left', opacity: bloqueada ? 0.55 : 1 }}
                >
                  <div style={{ width: 44, height: 44, borderRadius: 16, background: '#EFEDE4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                    {item.icono}
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 800, color: '#1A1A1A', lineHeight: 1.1 }}>{item.nombre}</p>
                  {item.descripcion && <p style={{ fontSize: 11, color: '#5A5A52', lineHeight: 1.4 }}>{item.descripcion}</p>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    {canjeada ? (
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#3E6B4A', display: 'flex', alignItems: 'center', gap: 4 }}><Check size={12} />Canjeada</span>
                    ) : bloqueada ? (
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#98A093', display: 'flex', alignItems: 'center', gap: 4 }}><Lock size={11} />{item.costeCreditos} créditos</span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#3E6B4A', display: 'flex', alignItems: 'center', gap: 4 }}><Coins size={11} />{item.costeCreditos} créditos</span>
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
          <p className="ap-label" style={{ marginBottom: 12 }}>Historial de créditos</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {miHistorial.map(h => (
              <div key={h.id} className="ap-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.descripcion}</p>
                  <p style={{ fontSize: 11, color: '#5A5A52' }}>{new Date(h.creadoEn).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</p>
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#3E6B4A', flexShrink: 0 }}>+{h.creditos}</span>
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
              <div style={{ width: 56, height: 56, borderRadius: 18, background: '#EFEDE4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, marginBottom: 12 }}>
                {canjeando.icono}
              </div>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: '#1A1A1A' }}>¿Canjear {canjeando.nombre}?</h2>
              <p style={{ fontSize: 13, color: '#5A5A52', marginTop: 4 }}>Se descontarán {canjeando.costeCreditos} créditos de tu saldo.</p>
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

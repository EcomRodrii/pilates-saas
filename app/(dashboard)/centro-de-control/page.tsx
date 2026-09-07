'use client';

import { useMemo, useState } from 'react';
import { RefreshCw, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStudio } from '@/lib/studio-context';
import { mensajeParaSocia, enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { useDecisiones, type RecomendacionAPI } from '@/components/decision/use-decisiones';
import { useAutonomiaConfig } from '@/components/decision/use-autonomia-config';
import { elegibleParaAutonomia } from '@/lib/decision/autonomia';
import { partirMasSituaciones } from '@/lib/decision/prioridad';
import { nivelSituacion, NIVEL_SITUACION_INFO, type NivelSituacion } from '@/components/decision/severidad';
import type { Recomendacion } from '@/lib/decision/tipos';
import { ExecutiveSummary } from '@/components/decision/executive-summary';
import { RecommendationCard } from '@/components/decision/recommendation-card';
import { WhileYouSlept } from '@/components/decision/while-you-slept';
import { SpecialistCard } from '@/components/decision/specialist-card';
import { ActivityList } from '@/components/decision/activity-list';
import { QuickActions } from '@/components/decision/quick-actions';
import { EmptyState } from '@/components/decision/empty-state';
import { PilotoAutomatico } from '@/components/decision/piloto-automatico';
import { BandejaHoy } from '@/components/decision/bandeja-hoy';
import { CodigosDescuento } from '@/components/decision/codigos-descuento';
import { RiesgoPlanton } from '@/components/decision/riesgo-planton';
import { EspecialistaCartera } from '@/components/centro-de-control/especialista-cartera';
import { ContratoDecisionOS } from '@/components/decision/contrato-decision-os';
import { VeredictoDelDia } from '@/components/decision/veredicto-del-dia';
import { SeguimientoPendiente } from '@/components/decision/seguimiento-pendiente';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Toast, useToast } from '@/components/ui/toast';

// Centro de Control — reorganizado como sistema de decisiones, no como lista
// de todo lo que Tentare sabe (petición explícita 2026-08-18). Jerarquía fija
// al desplegar "Ver todo el detalle": Piloto automático → Para hoy →
// Recomendaciones de hoy (Prioridades → Más situaciones) → Tu equipo y tu
// cartera → Riesgos → Accesos rápidos → Actividad. Fuera del desplegable,
// visibles siempre: Estado global (VeredictoDelDia) y Seguimiento.
//
// Cada situación pendiente cae en EXACTAMENTE un cubo de pantalla —
// Prioridades XOR Seguimiento XOR Más situaciones — para que nunca se vea la
// misma recomendación como dos tarjetas con cifras que puedan divergir. La
// partición (partirMasSituaciones, lib/decision/prioridad.ts) es puramente de
// presentación: no cambia lo que persiste ni lo que `/dashboard` (Action
// Center) recibe de `/api/decisiones` — ese contrato no se toca.
function frasesSeguimientoOutcome(o: { outcome: 'POSITIVO' | 'NEGATIVO' | 'NEUTRO'; titulo: string }): string {
  if (o.outcome === 'POSITIVO') return `Seguiste esto: ${o.titulo}. Funcionó.`;
  if (o.outcome === 'NEGATIVO') return `La última vez no acerté con esto: ${o.titulo}.`;
  return `Seguiste esto: ${o.titulo}. Sin cambios claros.`;
}

const GRUPOS_SITUACION: { nivel: NivelSituacion; titulo: string }[] = [
  { nivel: 'ACCION_RECOMENDADA', titulo: 'Acción recomendada' },
  { nivel: 'REVISAR', titulo: 'Revisar' },
  { nivel: 'SENAL', titulo: 'Señal' },
];

export default function CentroDeControlPage() {
  const { data, loading, error, aprobar, rechazar, posponer, analizarAhora, recargar } = useDecisiones();
  const { socios, studio, dependencySnapshots } = useStudio();
  const autonomiaConfig = useAutonomiaConfig();
  const hayCartera = dependencySnapshots.some(s => s.alumnasTotal > 0);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [detalleAbierto, setDetalleAbierto] = useState(false);
  const toast = useToast();

  const fechaHoy = new Date().toISOString().slice(0, 10);

  // Reorganización §2/§7: partir "Más situaciones" en lo que ya se venía
  // arrastrando desde un día anterior (Seguimiento) y lo genuinamente nuevo.
  const { seguimiento: enSeguimiento, nuevas: situacionesNuevas } = useMemo(
    () => data ? partirMasSituaciones(data.masSituaciones, fechaHoy) : { seguimiento: [], nuevas: [] },
    [data, fechaHoy],
  );

  // Puente Centro de Control ↔ Dashboard: mismo total que suma el Action
  // Center (`tituloAtencion`, lib/decision/action-center.ts) para que "Todo
  // bajo control" nunca contradiga "N cosas necesitan tu atención" a un clic
  // de distancia — ver hallazgo de auditoría "Veredicto de Marta" 2026-08-20.
  const totalPendiente = data ? data.prioridades.length + data.masSituaciones.length : 0;
  const anclaPendiente = enSeguimiento.length > 0 ? 'seguimiento' : 'recomendaciones';

  function handleVerPendiente() {
    setDetalleAbierto(true);
    setTimeout(() => {
      document.getElementById(anclaPendiente)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  const gruposSituacion = useMemo(() => {
    const grupos = new Map<NivelSituacion, RecomendacionAPI[]>([['ACCION_RECOMENDADA', []], ['REVISAR', []], ['SENAL', []]]);
    for (const r of situacionesNuevas) grupos.get(nivelSituacion(r.prioridad))!.push(r);
    return grupos;
  }, [situacionesNuevas]);

  // Reorganización §3: recomendaciones pendientes que el piloto automático
  // ejecutaría en el próximo ciclo si sigue encendido — SOLO una referencia
  // (icono + título + enlace a su tarjeta completa en Prioridades/Más
  // situaciones), nunca una tarjeta duplicada.
  const requiereAprobacion = useMemo(() => {
    if (!data || !autonomiaConfig?.activa) return [];
    return [...data.prioridades, ...situacionesNuevas]
      .filter(r => elegibleParaAutonomia(r as unknown as Recomendacion, autonomiaConfig));
  }, [data, situacionesNuevas, autonomiaConfig]);

  // Reorganización §13: el antiguo "círculo de aprendizaje" (outcomes ya
  // medidos, `data.seguimiento`) no desaparece — es historial de una decisión
  // ya tomada, así que se une al feed de Actividad en vez de tener su propia
  // sección arriba de todo.
  const actividadCompleta = useMemo(() => {
    if (!data) return [];
    const outcomes = data.seguimiento
      .filter(o => o.medidoEn)
      .map((o, i) => ({
        id: `outcome-${i}`, tipo: 'DECISION_OUTCOME', texto: frasesSeguimientoOutcome(o),
        socioId: o.socioId, enlace: null, creadoEn: o.medidoEn!, actorNombre: null,
      }));
    return [...data.actividad, ...outcomes]
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
      .slice(0, 10);
  }, [data]);

  // Enlace de WhatsApp con el mensaje ORIENTADO A LA SOCIA prerrellenado, para
  // que el propietario pueda escribirle con un clic (además del email que se
  // envía al aprobar). Solo para recomendaciones de contacto con socia + teléfono.
  function whatsappHref(r: RecomendacionAPI): string | null {
    if (!r.socioId) return null;
    const mensaje = mensajeParaSocia(r.tipo, r.datosUsados, studio?.nombre ?? '');
    if (!mensaje) return null;
    const socia = socios.find(s => s.id === r.socioId);
    return enlaceWhatsApp(socia?.telefono, mensaje.cuerpo);
  }

  async function handleAprobar(id: string) {
    setProcesandoId(id);
    const ok = await aprobar(id);
    if (!ok) toast.show('No se pudo confirmar. Comprueba tu conexión e inténtalo de nuevo.');
    setProcesandoId(null);
  }

  async function handleRechazar(id: string) {
    setProcesandoId(id);
    const ok = await rechazar(id);
    if (!ok) toast.show('No se pudo confirmar. Comprueba tu conexión e inténtalo de nuevo.');
    setProcesandoId(null);
  }

  async function handlePosponer(id: string) {
    setProcesandoId(id);
    const ok = await posponer(id);
    if (!ok) toast.show('No se pudo confirmar. Comprueba tu conexión e inténtalo de nuevo.');
    setProcesandoId(null);
  }

  async function handleAnalizar() {
    setAnalizando(true);
    try {
      const res = await analizarAhora();
      if (!res.ok) { toast.show(res.error ?? 'No se pudo lanzar el análisis'); return; }
      // El análisis es asíncrono (Inngest) — un margen antes de refrescar para
      // darle tiempo a persistir, sin bloquear la pantalla con un spinner largo.
      setTimeout(recargar, 4000);
    } finally {
      setAnalizando(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-28 animate-pulse rounded-3xl bg-muted" />
        <div className="h-20 animate-pulse rounded-3xl bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-[15px] font-medium text-foreground">No hemos podido cargar el Centro de Control</p>
        <p className="text-[13px] text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={recargar}>Reintentar</Button>
      </div>
    );
  }

  if (!data) return null;

  const modoAprendizaje = !data.resumen;

  return (
    <div className="flex flex-col gap-6 pb-10">
      <p className="text-[12px] font-medium uppercase tracking-widest text-muted-foreground">
        {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>

      <ContratoDecisionOS />

      {/* 1. Estado global */}
      <VeredictoDelDia
        veredicto={data.veredicto}
        onHecho={() => data.veredicto.recomendacion && handleAprobar(data.veredicto.recomendacion.id)}
        onYaLoSe={() => data.veredicto.recomendacion && handleRechazar(data.veredicto.recomendacion.id)}
        onPosponer={() => data.veredicto.recomendacion && handlePosponer(data.veredicto.recomendacion.id)}
        procesando={!!data.veredicto.recomendacion && procesandoId === data.veredicto.recomendacion.id}
        whatsappHref={data.veredicto.recomendacion ? whatsappHref(data.veredicto.recomendacion) : null}
        nAutonomasHoy={data.nAutonomasHoy ?? 0}
        totalPendiente={totalPendiente}
        onVerPendiente={handleVerPendiente}
        // Un estudio con menos de cinco socias todavía no puede producir un
        // mensaje del Umbral: no hay historial de asistencia ni de cobros del
        // que sacarlo. En vez de enseñar «Todo bajo control» los siete días de
        // la prueba —indistinguible de que la pantalla no haga nada— se enseña
        // un ejemplo rotulado de qué aparecerá aquí cuando lo haya.
        sinHistorial={socios.filter(s => s.activo).length < 5}
      />

      {/* 2. Seguimiento — situaciones ya detectadas, sin cambios desde la última revisión */}
      <div id="seguimiento">
        <SeguimientoPendiente items={enSeguimiento} />
      </div>

      <button
        type="button"
        onClick={() => setDetalleAbierto(v => !v)}
        className="flex w-fit items-center gap-1 self-start text-[12px] font-semibold text-muted-foreground hover:text-foreground"
      >
        {detalleAbierto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {detalleAbierto ? 'Ocultar todo el detalle' : 'Ver todo el detalle'}
      </button>

      {detalleAbierto && (
      <>
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={handleAnalizar} disabled={analizando}>
          <RefreshCw size={14} className={analizando ? 'animate-spin' : ''} />
          Analizar ahora
        </Button>
      </div>

      {/* 3. Piloto automático — ejecutado solo / pendiente de tu aprobación */}
      <div className="flex flex-col gap-4">
        <PilotoAutomatico />
        {!modoAprendizaje && data.resumen!.mientrasDormias.length > 0 && (
          <div className="flex flex-col gap-2 pl-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ejecutado automáticamente</p>
            <WhileYouSlept items={data.resumen!.mientrasDormias} />
          </div>
        )}
        {requiereAprobacion.length > 0 && (
          <div className="flex flex-col gap-2 pl-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Requiere tu aprobación</p>
            <ul className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-3">
              {requiereAprobacion.map(r => (
                <li key={r.id}>
                  <a href="#recomendaciones" className="flex items-center justify-between gap-2 text-[13px] text-foreground hover:text-brand-secondary">
                    <span className="truncate">{r.titulo}</span>
                    <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 4. Para hoy */}
      <BandejaHoy />

      {/* 5. Recomendaciones de hoy */}
      <div className="flex flex-col gap-6">
        <h2 className="font-heading text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Recomendaciones de hoy
        </h2>
        {modoAprendizaje ? (
          <EmptyState />
        ) : (
          <>
            <ExecutiveSummary resumen={data.resumen!} />

            <div id="recomendaciones" className="flex flex-col gap-6">
              {/* 6. Prioridades */}
              {data.prioridades.length > 0 && (
                <div id="prioridades" className="flex flex-col gap-3">
                  <h3 className="font-heading text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Prioridades
                  </h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {data.prioridades.map(r => (
                      <RecommendationCard
                        key={r.id}
                        recomendacion={r}
                        onAprobar={() => handleAprobar(r.id)}
                        onRechazar={() => handleRechazar(r.id)}
                        procesando={procesandoId === r.id}
                        whatsappHref={whatsappHref(r)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* 7. Más situaciones — 3 niveles: Acción recomendada / Revisar / Señal */}
              {situacionesNuevas.length > 0 && (
                <div className="flex flex-col gap-5">
                  <h3 className="font-heading text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {data.prioridades.length > 0 ? 'Más situaciones' : 'Situaciones a revisar'}
                  </h3>
                  {GRUPOS_SITUACION.map(({ nivel, titulo }) => {
                    const items = gruposSituacion.get(nivel) ?? [];
                    if (items.length === 0) return null;
                    const info = NIVEL_SITUACION_INFO[nivel];
                    return (
                      <div key={nivel} className="flex flex-col gap-3">
                        <span
                          className="w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{ color: info.color, backgroundColor: info.bg }}
                        >
                          {titulo}
                        </span>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          {items.map(r => (
                            <RecommendationCard
                              key={r.id}
                              recomendacion={r}
                              onAprobar={() => handleAprobar(r.id)}
                              onRechazar={() => handleRechazar(r.id)}
                              procesando={procesandoId === r.id}
                              whatsappHref={whatsappHref(r)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 10. Tu equipo y tu cartera — solo el resumen por especialista */}
      {!modoAprendizaje && data.porEspecialista.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-heading text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Tu equipo y tu cartera
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.porEspecialista.map(pe => <SpecialistCard key={pe.especialista} data={pe} />)}
          </div>
        </div>
      )}

      {/* 11. Riesgos — visión transversal, separada de las recomendaciones */}
      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Riesgos
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {hayCartera && <EspecialistaCartera />}
        </div>
        <RiesgoPlanton />
      </div>

      {/* 12. Accesos rápidos */}
      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Accesos rápidos
        </h2>
        <CodigosDescuento onToast={toast.show} />
        <QuickActions />
      </div>

      {/* 13. Actividad — historial/auditoría, siempre al final */}
      <ActivityList items={actividadCompleta} />
      </>
      )}
      {toast.message && <Toast message={toast.message} onDismiss={toast.dismiss} />}
    </div>
  );
}

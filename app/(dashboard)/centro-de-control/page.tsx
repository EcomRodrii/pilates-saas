'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { RefreshCw, ChevronRight } from 'lucide-react';
import { cn, hoyEnEstudio, TZ_ESTUDIO } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useStudio } from '@/lib/studio-context';
import { mensajeParaSocia, enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { useDecisiones, type RecomendacionAPI, type ResultadoAccion } from '@/components/decision/use-decisiones';
import { useAutonomiaConfig } from '@/components/decision/use-autonomia-config';
import { elegibleParaAutonomia } from '@/lib/decision/autonomia';
import { sigueAbierta } from '@/lib/decision/efecto-aprobar';
import { partirMasSituaciones } from '@/lib/decision/prioridad';
import { TEXTO_ANALISIS_TARDANDO } from '@/lib/decision/analisis-en-curso';
import type { Recomendacion } from '@/lib/decision/tipos';
import { FilaSituacion } from '@/components/decision/fila-situacion';
import { WhileYouSlept } from '@/components/decision/while-you-slept';
import { FilaEspecialista } from '@/components/decision/fila-especialista';
import { ActivityList } from '@/components/decision/activity-list';
import { EmptyState } from '@/components/decision/empty-state';
import { PilotoAutomatico } from '@/components/decision/piloto-automatico';
import { BandejaHoy } from '@/components/decision/bandeja-hoy';
import { RiesgoPlanton } from '@/components/decision/riesgo-planton';
import { EspecialistaCartera } from '@/components/decision/especialista-cartera';
import { ContratoDecisionOS } from '@/components/decision/contrato-decision-os';
import { VeredictoDelDia } from '@/components/decision/veredicto-del-dia';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Toast, useToast } from '@/components/ui/toast';

// Centro de Control — reorganizado como sistema de decisiones, no como lista
// de todo lo que Tentare sabe (petición explícita 2026-08-18). Jerarquía fija
// al desplegar "Ver todo el detalle": Recomendaciones de hoy (una sola lista
// de situaciones, PR3) → Cómo trabajo para ti (Piloto automático + Mi
// Equipo, PR4) → Riesgos → Actividad. Fuera del desplegable, siempre
// visible: Estado global (VeredictoDelDia, con "Para hoy" fusionado dentro).
//
// PR3 (§3): Prioridades + Más situaciones + Seguimiento eran tres
// presentaciones distintas (grid de tarjetas, 3 sub-rótulos de color, filas
// compactas) para lo que es conceptualmente una sola lista ordenada. Ahora
// se concatenan en bloques fijos — Prioridades → Nuevas → Seguimiento — SIN
// reordenar por score: cada tramo ya llega curado por el servidor (el cap de
// especialista/críticas de `seleccionarPrioridadesHome`, la partición
// temporal de `partirMasSituaciones`) y un merge por score global deshacería
// esas dos curaciones. Cada situación sigue cayendo en EXACTAMENTE un tramo
// — nunca la misma recomendación dos veces con cifras que puedan divergir.
// Esta partición es puramente de presentación: no cambia lo que persiste ni
// lo que `/dashboard` (Action Center) recibe de `/api/decisiones`.
//
// PR4 (§4): "Tu equipo y tu cartera" era un grid de hasta 8 SpecialistCard,
// con 6+ diciendo casi siempre "Nada que proponerte hoy" — puro peso visual
// por repetición de layout. Se fusiona con Piloto automático bajo "Cómo
// trabajo para ti" (las dos caras de "qué hace el sistema por ti": qué le
// dejo hacer solo, qué ha encontrado cada especialista) y el grid pasa a
// filas de una línea (FilaEspecialista). Riesgos y Actividad NO se tocan:
// ya tienen la forma de fila/resumen que este cambio persigue — fusionarlas
// también habría mezclado config (Piloto) con alerta transversal (Riesgos)
// e historial (Actividad) sin resolver ningún ruido adicional.
function frasesSeguimientoOutcome(o: { outcome: 'POSITIVO' | 'NEGATIVO' | 'NEUTRO'; titulo: string }): string {
  if (o.outcome === 'POSITIVO') return `Seguiste esto: ${o.titulo}. Funcionó.`;
  if (o.outcome === 'NEGATIVO') return `La última vez no acerté con esto: ${o.titulo}.`;
  return `Seguiste esto: ${o.titulo}. Sin cambios claros.`;
}

// `partirMasSituaciones` garantiza que el día (en Madrid) de `creadoEn` es
// anterior a `fechaHoy` para todo lo que entra en `seguimiento`, así que el
// resultado siempre es ≥1, sin caso 0/negativo que blindar. Misma base de
// comparación (el día en Madrid) que esa partición, para no tener dos «hoy»
// en la misma pantalla.
function diasAbierta(creadoEn: string, fechaHoy: string): number {
  return Math.round((Date.parse(fechaHoy) - Date.parse(hoyEnEstudio(new Date(creadoEn)))) / 86400000);
}

/** Cada situación de la lista, localizable por su id para llegar a ella desde un enlace. */
function AnclaSituacion({ id, resaltada, children }: { id: string; resaltada: boolean; children: ReactNode }) {
  return (
    <div
      data-recomendacion={id}
      data-resaltada={resaltada || undefined}
      className={cn('scroll-mt-24 rounded-2xl transition-shadow', resaltada && 'ring-2 ring-primary ring-offset-2 ring-offset-background')}
    >
      {children}
    </div>
  );
}

export default function CentroDeControlPage() {
  // `seguirCobros`: tras «Cobrar ahora», la pantalla pregunta cómo ha ido y lo dice.
  // `seguirAnalisis`: tras «Analizar ahora» (o con uno en marcha desde otra
  // pestaña), pregunta cuándo termina y entonces recarga.
  const { data, loading, error, aprobar, rechazar, posponer, yaContactada, analizarAhora, analisis, recargar, cobrosTardando } = useDecisiones({ seguirCobros: true, seguirAnalisis: true });
  const { socios, studio } = useStudio();
  const autonomia = useAutonomiaConfig();
  // Las recomendaciones con una petición en vuelo, todas: con un solo id, pulsar
  // en otra tarjeta mientras la primera esperaba le volvía a encender los
  // botones a la primera, que ahora sigue en pantalla hasta la respuesta.
  const [procesando, setProcesando] = useState<ReadonlySet<string>>(() => new Set());
  // El POST de «Analizar ahora» en vuelo; lo que dura el análisis lo lleva `analisis`.
  const [lanzando, setLanzando] = useState(false);
  const analizando = lanzando || analisis === 'en-curso';
  const [detalleAbierto, setDetalleAbierto] = useState(false);
  const toast = useToast();

  // El día en Madrid, el mismo con el que el servidor elige el mensaje de hoy:
  // con el día UTC, de 00:00 a 02:00 de Madrid «hoy» todavía era ayer.
  const fechaHoy = hoyEnEstudio();

  // El Veredicto del Día ya muestra esta recomendación como el mensaje único
  // de arriba: si además cae en Prioridades/Más situaciones (su mismo score
  // suele ser justo el que más arriba puntúa), se veía DOS VECES en la misma
  // pantalla — justo lo que "un solo mensaje" promete no hacer (auditoría de
  // arquitectura, 22-sep-2026). Se filtra solo de lo que se PINTA como
  // tarjeta, nunca de `data.prioridades`/`data.masSituaciones` en crudo:
  // `totalPendiente` de abajo tiene que seguir contando esta recomendación
  // mientras siga sin resolver, o el puente con el Dashboard se desincroniza.
  // Una aplazada hoy con «Recuérdamelo» NO se filtra: el veredicto ya no la
  // pinta con botones, sino que dice que sigue en el detalle, y ahí tiene que estar.
  const idVeredicto = data && !data.veredicto.pospuesta ? data.veredicto.recomendacion?.id ?? null : null;
  const prioridadesParaTarjetas = useMemo(
    () => (data ? data.prioridades.filter(r => r.id !== idVeredicto) : []),
    [data, idVeredicto],
  );

  // Reorganización §2/§7: partir "Más situaciones" en lo que ya se venía
  // arrastrando desde un día anterior (Seguimiento) y lo genuinamente nuevo.
  const { seguimiento: enSeguimiento, nuevas: situacionesNuevas } = useMemo(
    () => data
      ? partirMasSituaciones(data.masSituaciones.filter(r => r.id !== idVeredicto), fechaHoy)
      : { seguimiento: [], nuevas: [] },
    [data, fechaHoy, idVeredicto],
  );

  // Puente Centro de Control ↔ Dashboard: mismo total que suma el Action
  // Center (`tituloAtencion`, lib/decision/action-center.ts) para que el
  // veredicto nunca diga «no hay nada» frente a «N cosas necesitan tu atención»
  // a un clic de distancia — hallazgo de auditoría "Veredicto de Marta" 2026-08-20.
  // Deliberadamente NO usa `prioridadesParaTarjetas`: cuenta lo pendiente de
  // verdad, no lo que se pinta como tarjeta en esta pantalla. Un cobro recién
  // aprobado sigue en pantalla diciendo que está en marcha, pero ya no está
  // pendiente: no cuenta (`sigueAbierta`).
  const totalPendiente = data
    ? data.prioridades.filter(r => sigueAbierta(r.estado)).length + data.masSituaciones.filter(r => sigueAbierta(r.estado)).length
    : 0;

  // Reorganización §2 (PR2): sustituye a ExecutiveSummary, que sacaba
  // "tiempo estimado"/"impacto potencial" de `resumen` — un snapshot de
  // cuando corrió el cron. Recalculado aquí con los MISMOS arrays que se
  // pintan como tarjetas, para que nunca diverja de lo que se ve (bug
  // "2 vs 11" ya documentado). NO incluye `enSeguimiento`: son filas sin
  // botones de acción (PR3), no aportan tiempo/impacto que sumar.
  const itemsVivos = [...prioridadesParaTarjetas, ...situacionesNuevas].filter(r => sigueAbierta(r.estado));
  const tiempoEstimadoVivoMin = itemsVivos.reduce((acc, r) => acc + r.tiempoEstimadoMin, 0);
  const impactoEurMesVivo = itemsVivos.reduce(
    (acc, r) => acc + (r.impacto?.unidad === 'EUR_MES' ? r.impacto.valor : 0), 0,
  );

  function handleVerPendiente() {
    setDetalleAbierto(true);
    setTimeout(() => {
      document.getElementById('recomendaciones')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  // Llegar a por algo concreto: `?rec=<id>` (el «Ver en el Centro de Control» de
  // la ficha de una clienta) o `?detalle=1` (el «Ver y decidir» del Resumen). Abre
  // el detalle y baja hasta ello: antes se llegaba con todo plegado y había que
  // buscar a esa clienta a mano entre todas las situaciones. Se lee una vez y se
  // quita de la dirección, para que volver o recargar no lo repita.
  const [pedida, setPedida] = useState<{ rec: string | null } | null>(null);
  const [resaltada, setResaltada] = useState<string | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const rec = p.get('rec');
    if (!rec && p.get('detalle') !== '1') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Lee window.location.search: la URL no existe durante el render en servidor.
    setPedida({ rec });
    setDetalleAbierto(true);
    p.delete('rec');
    p.delete('detalle');
    const resto = p.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${resto ? `?${resto}` : ''}`);
  }, []);

  useEffect(() => {
    if (!pedida || !data) return;
    const rec = pedida.rec;
    const t = setTimeout(() => {
      setPedida(null);
      if (!rec) {
        document.getElementById('recomendaciones')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      // La del mensaje del día no se repite en la lista: está arriba del todo
      // (salvo aplazada, que sí está en la lista).
      if (rec === idVeredicto) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const fila = document.querySelector(`[data-recomendacion="${CSS.escape(rec)}"]`);
      if (!fila) {
        toast.show('Esa situación ya no está pendiente: se resolvió o el Centro de Control la retiró.');
        return;
      }
      fila.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setResaltada(rec);
    }, 50);
    return () => clearTimeout(t);
  }, [pedida, data, toast, idVeredicto]);

  useEffect(() => {
    if (!resaltada) return;
    const t = setTimeout(() => setResaltada(null), 2500);
    return () => clearTimeout(t);
  }, [resaltada]);

  // Reorganización §3: recomendaciones pendientes que el piloto automático
  // ejecutaría en el próximo ciclo si sigue encendido — SOLO una referencia
  // (icono + título + enlace a su tarjeta completa en Prioridades/Más
  // situaciones), nunca una tarjeta duplicada.
  const requiereAprobacion = useMemo(() => {
    if (!data || !autonomia.config?.activa) return [];
    return [...prioridadesParaTarjetas, ...situacionesNuevas]
      .filter(r => elegibleParaAutonomia(r as unknown as Recomendacion, autonomia.config!));
  }, [data, prioridadesParaTarjetas, situacionesNuevas, autonomia.config]);

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

  // Las cuatro acciones de una recomendación. Ninguna quita la tarjeta antes de
  // la respuesta (use-decisiones.ts): mientras tanto, sus botones apagados; con
  // un no, la tarjeta como estaba y el error que dio el servidor, como error.
  async function accionar(r: RecomendacionAPI, accion: (r: RecomendacionAPI) => Promise<ResultadoAccion>) {
    setProcesando(prev => new Set(prev).add(r.id));
    const res = await accion(r);
    if (!res.ok) toast.showError(res.error);
    setProcesando(prev => {
      const sigue = new Set(prev);
      sigue.delete(r.id);
      return sigue;
    });
  }

  async function handleAnalizar() {
    setLanzando(true);
    try {
      const res = await analizarAhora();
      if (res.mensaje) {
        if (res.esError) toast.showError(res.mensaje);
        else toast.show(res.mensaje);
      }
    } finally {
      setLanzando(false);
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
      {/* La pantalla no tenía h1 (auditoría de arquitectura, 22-sep-2026):
          "Centro de Control" solo existía en el menú lateral. "Analizar ahora"
          se mueve aquí desde dentro del desplegable — era el único CTA real
          para forzar el primer análisis de un estudio nuevo, y vivía detrás
          de un clic que nadie tenía motivo para dar el primer día. */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-[20px] font-semibold text-foreground">Centro de Control</h1>
          <p className="text-[12px] font-medium uppercase tracking-widest text-muted-foreground">
            {/* El día en Madrid, como el mensaje que hay debajo: con la zona del
                navegador, uno en UTC a las 01:30 de Madrid ponía la fecha de ayer. */}
            {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ_ESTUDIO })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button variant="ghost" size="sm" onClick={handleAnalizar} disabled={analizando} aria-busy={analizando || undefined}>
            <RefreshCw size={14} className={analizando ? 'animate-spin' : ''} />
            {analizando ? 'Analizando…' : 'Analizar ahora'}
          </Button>
          {analisis === 'tardando' && (
            <p role="status" className="max-w-[16rem] text-right text-[12px] text-muted-foreground">{TEXTO_ANALISIS_TARDANDO}</p>
          )}
        </div>
      </div>

      <ContratoDecisionOS hayAnalisis={!modoAprendizaje} />

      {/* 1. Estado global */}
      <VeredictoDelDia
        veredicto={data.veredicto}
        onAprobar={() => data.veredicto.recomendacion && accionar(data.veredicto.recomendacion, aprobar)}
        onYaContactada={() => data.veredicto.recomendacion && accionar(data.veredicto.recomendacion, yaContactada)}
        onYaLoSe={() => data.veredicto.recomendacion && accionar(data.veredicto.recomendacion, rechazar)}
        onPosponer={() => data.veredicto.recomendacion && accionar(data.veredicto.recomendacion, posponer)}
        procesando={!!data.veredicto.recomendacion && procesando.has(data.veredicto.recomendacion.id)}
        tardando={!!data.veredicto.recomendacion && cobrosTardando.has(data.veredicto.recomendacion.id)}
        whatsappHref={data.veredicto.recomendacion ? whatsappHref(data.veredicto.recomendacion) : null}
        nAutonomasHoy={data.nAutonomasHoy ?? 0}
        nAutonomasFallidasHoy={data.nAutonomasFallidasHoy ?? 0}
        totalPendiente={totalPendiente}
        onVerPendiente={handleVerPendiente}
        // Un estudio con menos de cinco socias todavía no puede producir un
        // mensaje del Umbral: no hay historial de asistencia ni de cobros del
        // que sacarlo. En vez de un veredicto vacío los siete días de la
        // prueba —indistinguible de que la pantalla no haga nada— se enseña
        // un ejemplo rotulado de qué aparecerá aquí cuando lo haya.
        sinHistorial={socios.filter(s => s.activo).length < 5}
        bandejaHoy={<BandejaHoy />}
        // Tenti piensa mientras dura el análisis (y no el POST: eso es «Analizando…» del botón).
        analisis={analisis}
      />

      <button
        type="button"
        onClick={() => setDetalleAbierto(v => !v)}
        aria-expanded={detalleAbierto}
        aria-controls="detalle-centro-de-control"
        className="flex w-fit items-center gap-1 self-start text-[12px] font-semibold text-muted-foreground hover:text-foreground"
      >
        {detalleAbierto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {detalleAbierto ? 'Ocultar todo el detalle' : 'Ver todo el detalle'}
      </button>

      {detalleAbierto && (
      <div id="detalle-centro-de-control" className="contents">
      {/* 2. Recomendaciones de hoy — "Para hoy" (BandejaHoy) ya no vive aquí:
          se pinta fusionada dentro de VeredictoDelDia (§2, arriba). */}
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="font-heading text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Recomendaciones de hoy
          </h2>
          {itemsVivos.length > 0 && (
            <p className="mt-1 text-[12px] text-muted-foreground">
              Tiempo estimado · <strong className="font-semibold text-foreground">{tiempoEstimadoVivoMin} min</strong>
              {impactoEurMesVivo > 0 && (
                <> · Impacto potencial estimado · <strong className="font-semibold text-foreground">+{impactoEurMesVivo}€/mes</strong></>
              )}
            </p>
          )}
        </div>
        {modoAprendizaje ? (
          <EmptyState />
        ) : (
            <div id="recomendaciones" className="flex flex-col gap-3">
              {prioridadesParaTarjetas.map(r => (
                <AnclaSituacion key={r.id} id={r.id} resaltada={resaltada === r.id}>
                  <FilaSituacion
                    variante="completo"
                    recomendacion={r}
                    onAprobar={() => accionar(r, aprobar)}
                    onYaContactada={() => accionar(r, yaContactada)}
                    onRechazar={() => accionar(r, rechazar)}
                    procesando={procesando.has(r.id)}
                    tardando={cobrosTardando.has(r.id)}
                    whatsappHref={whatsappHref(r)}
                  />
                </AnclaSituacion>
              ))}
              {situacionesNuevas.map(r => (
                <AnclaSituacion key={r.id} id={r.id} resaltada={resaltada === r.id}>
                  <FilaSituacion
                    variante="completo"
                    recomendacion={r}
                    onAprobar={() => accionar(r, aprobar)}
                    onYaContactada={() => accionar(r, yaContactada)}
                    onRechazar={() => accionar(r, rechazar)}
                    procesando={procesando.has(r.id)}
                    tardando={cobrosTardando.has(r.id)}
                    whatsappHref={whatsappHref(r)}
                  />
                </AnclaSituacion>
              ))}
              {enSeguimiento.map(r => (
                <AnclaSituacion key={r.id} id={r.id} resaltada={resaltada === r.id}>
                  <FilaSituacion
                    variante="seguimiento"
                    recomendacion={r}
                    diasAbierta={diasAbierta(r.creadoEn, fechaHoy)}
                  />
                </AnclaSituacion>
              ))}
            </div>
        )}
      </div>

      {/* 3. Cómo trabajo para ti — Piloto automático (qué le dejo hacer
          solo) + Mi Equipo (qué ha encontrado cada especialista), fusionados
          bajo un único encabezado: son las dos caras de "cómo trabaja el
          sistema", a diferencia de Riesgos (alerta transversal) y Actividad
          (historial), que se quedan como secciones propias. */}
      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Cómo trabajo para ti
        </h2>
        <PilotoAutomatico autonomia={autonomia} />
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
        {!modoAprendizaje && data.porEspecialista.length > 0 && (
          <div className="rounded-3xl border border-border bg-card p-1">
            {data.porEspecialista.map(pe => <FilaEspecialista key={pe.especialista} data={pe} />)}
          </div>
        )}
      </div>

      {/* 4. Riesgos — visión transversal, separada de las recomendaciones */}
      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Riesgos
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <EspecialistaCartera />
        </div>
        <RiesgoPlanton />
      </div>

      {/* Accesos rápidos (Nueva clase/clienta/factura): retirado de aquí —
          uso medido = 0, ya están en el menú y en ⌘K (auditoría de
          arquitectura, 22-sep-2026). */}

      {/* 5. Actividad — historial/auditoría, siempre al final */}
      <ActivityList items={actividadCompleta} />
      </div>
      )}
      {toast.message && <Toast message={toast.message} onDismiss={toast.dismiss} variant={toast.variant} />}
    </div>
  );
}

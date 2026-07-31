'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStudio } from '@/lib/studio-context';
import { mensajeParaSocia, enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { useDecisiones, type RecomendacionAPI } from '@/components/decision/use-decisiones';
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
import { Seguimiento } from '@/components/decision/seguimiento';
import { ChevronDown, ChevronUp } from 'lucide-react';

// Centro de Control — el Home basado en decisiones (Bible doc 4). Orden fijo,
// nunca cambia (doc 5 §17): Resumen Ejecutivo → Prioridades → Mientras
// Dormías → Mi Equipo → Actividad → Accesos rápidos. El saludo (con la fecha
// y el nombre del propietario ya incrustados) lo redacta el Director en
// servidor — esta página solo lo presenta.
export default function CentroDeControlPage() {
  const { data, loading, error, aprobar, rechazar, posponer, analizarAhora, recargar } = useDecisiones();
  const { socios, studio, dependencySnapshots } = useStudio();
  const hayCartera = dependencySnapshots.some(s => s.alumnasTotal > 0);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [detalleAbierto, setDetalleAbierto] = useState(false);

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
    await aprobar(id);
    setProcesandoId(null);
  }

  async function handleRechazar(id: string) {
    setProcesandoId(id);
    await rechazar(id);
    setProcesandoId(null);
  }

  async function handlePosponer(id: string) {
    setProcesandoId(id);
    await posponer(id);
    setProcesandoId(null);
  }

  async function handleAnalizar() {
    setAnalizando(true);
    const ok = await analizarAhora();
    // El análisis es asíncrono (Inngest) — un margen antes de refrescar para
    // darle tiempo a persistir, sin bloquear la pantalla con un spinner largo.
    if (ok) setTimeout(recargar, 4000);
    setAnalizando(false);
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
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-medium uppercase tracking-widest text-muted-foreground">
          {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <Button variant="ghost" size="sm" onClick={handleAnalizar} disabled={analizando}>
          <RefreshCw size={14} className={analizando ? 'animate-spin' : ''} />
          Analizar ahora
        </Button>
      </div>

      <ContratoDecisionOS />

      <VeredictoDelDia
        veredicto={data.veredicto}
        onHecho={() => data.veredicto.recomendacion && handleAprobar(data.veredicto.recomendacion.id)}
        onYaLoSe={() => data.veredicto.recomendacion && handleRechazar(data.veredicto.recomendacion.id)}
        onPosponer={() => data.veredicto.recomendacion && handlePosponer(data.veredicto.recomendacion.id)}
        procesando={!!data.veredicto.recomendacion && procesandoId === data.veredicto.recomendacion.id}
        whatsappHref={data.veredicto.recomendacion ? whatsappHref(data.veredicto.recomendacion) : null}
      />

      <Seguimiento items={data.seguimiento} />

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
      <PilotoAutomatico />

      <BandejaHoy />

      {modoAprendizaje ? (
        <EmptyState />
      ) : (
        <>
          <ExecutiveSummary resumen={data.resumen!} />

          <div id="recomendaciones" className="flex flex-col gap-6">
            {data.prioridades.length > 0 && (
              <div id="prioridades" className="flex flex-col gap-3">
                <h2 className="font-heading text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Prioridades
                </h2>
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

            {/* Todas las demás situaciones detectadas (MEDIA/BAJA) — también
                accionables, no solo un número en "Mi Equipo". */}
            {data.masSituaciones.length > 0 && (
              <div className="flex flex-col gap-3">
                <h2 className="font-heading text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {data.prioridades.length > 0 ? 'Más situaciones' : 'Situaciones a revisar'}
                </h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {data.masSituaciones.map(r => (
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
          </div>

          <WhileYouSlept items={data.resumen!.mientrasDormias} />
        </>
      )}

      {/* En MODO APRENDIZAJE no se pintan los especialistas.
          Este bloque estaba fuera del ternario de arriba, y su guarda es siempre
          cierta porque la API siembra los 7 especialistas aunque no haya
          análisis. Resultado: la misma pantalla decía "Aún estoy conociendo tu
          estudio, necesito semanas de datos" Y, debajo, siete tarjetas verdes
          diciendo "Excelente · Todo en orden". Las dos cosas no pueden ser
          verdad a la vez, y la segunda es la que se cree la dueña.
          La cartera SÍ se mantiene: no sale del análisis diario, se calcula
          sobre reservas reales, así que en modo aprendizaje sigue siendo cierta. */}
      {((!modoAprendizaje && data.porEspecialista.length > 0) || hayCartera) && (
        <div className="flex flex-col gap-3">
          <h2 className="font-heading text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Mi Equipo
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {!modoAprendizaje && data.porEspecialista.map(pe => <SpecialistCard key={pe.especialista} data={pe} />)}
            <EspecialistaCartera />
          </div>
        </div>
      )}

      <RiesgoPlanton />

      <CodigosDescuento />

      <ActivityList items={data.actividad} />

      <QuickActions />
      </>
      )}
    </div>
  );
}

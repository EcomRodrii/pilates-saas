'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDecisiones } from '@/components/decision/use-decisiones';
import { ExecutiveSummary } from '@/components/decision/executive-summary';
import { RecommendationCard } from '@/components/decision/recommendation-card';
import { WhileYouSlept } from '@/components/decision/while-you-slept';
import { SpecialistCard } from '@/components/decision/specialist-card';
import { ActivityList } from '@/components/decision/activity-list';
import { QuickActions } from '@/components/decision/quick-actions';
import { EmptyState } from '@/components/decision/empty-state';

// Centro de Control — el Home basado en decisiones (Bible doc 4). Orden fijo,
// nunca cambia (doc 5 §17): Resumen Ejecutivo → Prioridades → Mientras
// Dormías → Mi Equipo → Actividad → Accesos rápidos. El saludo (con la fecha
// y el nombre del propietario ya incrustados) lo redacta el Director en
// servidor — esta página solo lo presenta.
export default function CentroDeControlPage() {
  const { data, loading, error, aprobar, rechazar, analizarAhora, recargar } = useDecisiones();
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [analizando, setAnalizando] = useState(false);

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

      {modoAprendizaje ? (
        <EmptyState />
      ) : (
        <>
          <ExecutiveSummary resumen={data.resumen!} />

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
                  />
                ))}
              </div>
            </div>
          )}

          <WhileYouSlept items={data.resumen!.mientrasDormias} />
        </>
      )}

      {data.porEspecialista.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-heading text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Mi Equipo
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.porEspecialista.map(pe => <SpecialistCard key={pe.especialista} data={pe} />)}
          </div>
        </div>
      )}

      <ActivityList items={data.actividad} />

      <QuickActions />
    </div>
  );
}

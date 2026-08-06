'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { dbListarPenalizacionesPendientes, type PenalizacionPendiente } from '@/lib/supabase-data';
import { aprobarPenalizacion } from '@/lib/api-client';
import { Button } from '@/components/ui/button';

// Fase 3: cargos de penalización (cancelación tardía/no-show) detectados con
// el modo de aprobación manual — el estudio decidió que quiere revisar cada
// cobro antes de tocar la tarjeta de la socia. Alcance deliberadamente
// pequeño: una lista + un botón, no una pantalla nueva. Solo se monta si
// `puedeMoverDinero` (mismo gate que aprueba el cobro en el servidor).
export function PenalizacionesPendientes({ onToast }: { onToast: (m: string) => void }) {
  const [items, setItems] = useState<PenalizacionPendiente[] | null>(null);
  const [aprobando, setAprobando] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void dbListarPenalizacionesPendientes().then(r => { if (vivo) setItems(r); });
    return () => { vivo = false; };
  }, []);

  async function aprobar(id: string) {
    setAprobando(id);
    const r = await aprobarPenalizacion(id);
    setAprobando(null);
    if ('error' in r) { onToast(r.error); return; }
    // 202: el cargo SÍ entró en Stripe, pero no se pudo dejar escrito y el
    // servidor ha marcado la penalización FALLIDA. La fila se quita igual —ya
    // no está pendiente de aprobar, y volver a pulsar cobraría otra vez— pero
    // el mensaje tiene que decir lo que ha pasado de verdad: antes desaparecía
    // con un "Cobro aprobado" que era exactamente lo contrario.
    if (r.aviso === 'COBRADO_SIN_PERSISTIR') {
      setItems(prev => (prev ?? []).filter(p => p.id !== id));
      onToast(r.detalle ?? 'Se ha cobrado en Stripe, pero no ha quedado registrado: revísalo antes de volver a cobrarlo.');
      return;
    }
    setItems(prev => (prev ?? []).filter(p => p.id !== id));
    onToast('Cobro aprobado');
  }

  if (!items?.length) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="size-4 text-amber-500" />
        <p className="text-[13px] font-medium text-foreground">
          {items.length} penalización{items.length > 1 ? 'es' : ''} pendiente{items.length > 1 ? 's' : ''} de aprobar
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {items.map(p => (
          <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] text-foreground">{p.socioNombre}</p>
              <p className="text-[11px] text-muted-foreground">
                {p.tipo === 'NO_SHOW' ? 'No presentada' : 'Cancelación tardía'} · {p.importe.toFixed(2)} €
              </p>
            </div>
            <Button
              size="sm" variant="outline" disabled={aprobando === p.id}
              onClick={() => aprobar(p.id)}
            >
              {aprobando === p.id ? 'Cobrando…' : 'Aprobar y cobrar'}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

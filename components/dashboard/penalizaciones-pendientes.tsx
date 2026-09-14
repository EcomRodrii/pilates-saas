'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { dbListarPenalizacionesPendientes, type PenalizacionPendiente } from '@/lib/supabase-data';
import { aprobarPenalizacion } from '@/lib/api-client';
import { queHaceLaTarjeta } from '@/lib/billing/penalizacion-aprobar-reglas';
import { ANCLA_DECIDIR, invalidarEstadoEstudio } from '@/lib/estado-estudio-cliente';
import { formatEuro } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// Fase 3: cargos de penalización (cancelación tardía/no-show) detectados con
// el modo de aprobación manual — el estudio decidió que quiere revisar cada
// cobro antes de tocar la tarjeta de la socia. Alcance deliberadamente
// pequeño: una lista + un botón, no una pantalla nueva. Solo se monta si
// `puedeMoverDinero` (mismo gate que aprueba el cobro en el servidor).
//
// Qué hace la fila con cada respuesta lo decide `queHaceLaTarjeta`
// (lib/billing/penalizacion-aprobar-reglas.ts): se va solo si la penalización
// ya no está pendiente; si no se sabe qué pasó (red, 5xx), se queda con el
// botón activo y lo dice, porque reintentar no cobra dos veces.
export function PenalizacionesPendientes({ onToast }: { onToast: (m: string) => void }) {
  const [items, setItems] = useState<PenalizacionPendiente[] | null>(null);
  const [aprobando, setAprobando] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<Record<string, string>>({});
  // `aprobando` llega un render tarde: dos toques en el mismo tick lo verían a
  // null los dos y saldrían dos POST. El ref corta el segundo en el acto.
  const enVuelo = useRef(false);

  useEffect(() => {
    let vivo = true;
    void dbListarPenalizacionesPendientes().then(r => { if (vivo) setItems(r); });
    return () => { vivo = false; };
  }, []);

  async function aprobar(id: string) {
    if (aprobando || enVuelo.current) return;
    enVuelo.current = true;
    setAprobando(id);
    setAvisos(prev => ({ ...prev, [id]: '' }));
    try {
      const { quitarFila, mensaje } = queHaceLaTarjeta(await aprobarPenalizacion(id));
      if (!quitarFila) {
        setAvisos(prev => ({ ...prev, [id]: mensaje }));
        return;
      }
      // 202 incluido: el cargo entró y ya no está pendiente de aprobar; el
      // mensaje dice lo que ha pasado de verdad, no «Cobro aprobado».
      setItems(prev => (prev ?? []).filter(p => p.id !== id));
      invalidarEstadoEstudio();
      onToast(mensaje);
    } finally {
      enVuelo.current = false;
      setAprobando(null);
    }
  }

  if (!items?.length) return null;

  return (
    // Sin marco propio: vive dentro de la bandeja (EstadoDelEstudio), que ya lo pone.
    <div id={ANCLA_DECIDIR.penalizacionesPorAprobar} tabIndex={-1}
      className="scroll-mt-20 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
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
                {p.tipo === 'NO_SHOW' ? 'No presentada' : 'Cancelación tardía'} · {formatEuro(p.importe)}
              </p>
              {avisos[p.id] && (
                <p role="status" className="mt-1 text-[12px] leading-snug text-foreground">{avisos[p.id]}</p>
              )}
            </div>
            <Button
              size="sm" variant="outline" disabled={aprobando !== null}
              onClick={() => void aprobar(p.id)}
              className="shrink-0"
            >
              {aprobando === p.id ? 'Cobrando…' : `Aprobar y cobrar ${formatEuro(p.importe)}`}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

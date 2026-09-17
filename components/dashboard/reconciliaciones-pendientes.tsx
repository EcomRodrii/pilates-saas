'use client';

import { useEffect, useRef, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { terminalReconciliacionesPendientes, terminalMarcarReconciliado, type ReconciliacionPendiente } from '@/lib/api-client';
import { ANCLA_DECIDIR, invalidarEstadoEstudio } from '@/lib/estado-estudio-cliente';
import { formatEuro } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// A-14 (backstop): cobros por datáfono que Stripe confirma pero que se quedaron
// sin venta registrada (el POS se cerró tras el tap). El webhook ya los detecta
// y `/api/terminal/reconciliar` ya los resuelve — lo que faltaba era la pantalla
// para que la propietaria/recepción los viera. Mismo patrón que
// `PenalizacionesPendientes`: una lista + un botón, no una pantalla nueva. Solo
// se monta con `puedeMoverDinero` (mismo gate que exige el propio endpoint).
export function ReconciliacionesPendientes({ onToast }: { onToast: (m: string) => void }) {
  const [items, setItems] = useState<ReconciliacionPendiente[] | null>(null);
  const [resolviendo, setResolviendo] = useState<string | null>(null);
  // Mismo motivo que en PenalizacionesPendientes: sin el ref, dos toques en el
  // mismo tick verían `resolviendo` a null los dos y saldrían dos POST.
  const enVuelo = useRef(false);

  useEffect(() => {
    let vivo = true;
    void terminalReconciliacionesPendientes().then(r => { if (vivo) setItems(r); });
    return () => { vivo = false; };
  }, []);

  async function resolver(paymentIntentId: string) {
    if (resolviendo || enVuelo.current) return;
    enVuelo.current = true;
    setResolviendo(paymentIntentId);
    try {
      const ok = await terminalMarcarReconciliado({ paymentIntentId });
      if (!ok) { onToast('No se pudo marcar el cobro como resuelto'); return; }
      setItems(prev => (prev ?? []).filter(r => r.paymentIntentId !== paymentIntentId));
      invalidarEstadoEstudio();
      onToast('Cobro marcado como resuelto');
    } finally {
      enVuelo.current = false;
      setResolviendo(null);
    }
  }

  if (!items?.length) return null;

  return (
    // Sin marco propio: vive dentro de la bandeja (EstadoDelEstudio), que ya lo pone.
    <div id={ANCLA_DECIDIR.reconciliacionesPorRevisar} tabIndex={-1}
      className="scroll-mt-20 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
      <div className="mb-3 flex items-center gap-2">
        <CreditCard className="size-4 text-amber-500" />
        <p className="text-[13px] font-medium text-foreground">
          {items.length} cobro{items.length > 1 ? 's' : ''} de caja sin venta registrada
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {items.map(r => (
          <div key={r.paymentIntentId} className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] text-foreground">{r.concepto ?? 'Cobro por datáfono'}</p>
              <p className="text-[11px] text-muted-foreground">{formatEuro(r.importe)}</p>
            </div>
            <Button
              size="sm" variant="outline" disabled={resolviendo !== null}
              onClick={() => void resolver(r.paymentIntentId)}
              className="shrink-0"
            >
              {resolviendo === r.paymentIntentId ? 'Marcando…' : 'Marcar resuelto'}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { Banknote, Loader2, AlertCircle } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { formatEuro } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// «Vengo a pagar la cuota.»
//
// Es de las cosas más normales que pasan en un mostrador, y el TPV no sabía
// hacerla: había que salir a /cobros, buscar a la socia y marcarlo allí. Peor,
// ese camino NO apuntaba nada en la caja, así que el efectivo entraba en el
// cajón sin constar y el arqueo del día salía sobrado sin explicación.
//
// ⚠️ SOLO EFECTIVO, a propósito. Marcar a mano un recibo como pagado «con
// tarjeta» es exactamente lo que este rediseño existe para eliminar: una
// transacción de tarjeta dada por buena sin que ningún proveedor lo haya
// confirmado. El efectivo es distinto — hay alguien contándolo, y el recuento
// del cierre lo verifica. Cobrar un recibo con el datáfono necesita pasar por
// el datáfono de verdad, y eso todavía no está construido para recibos.
//
// Reutiliza `marcarCobrado` del contexto, la MISMA que usa /cobros: lleva
// dentro el compare-and-set que impide dos facturas para un cobro, el sellado
// fiscal y la renovación del bono. Duplicar eso aquí habría sido el sistema
// paralelo que no queremos.
// ─────────────────────────────────────────────────────────────────────────────

const COBRABLES = ['PENDIENTE', 'FALLIDO'] as const;

export function DeudaClienta({ socioId, onCobrado }: { socioId: string; onCobrado: () => void }) {
  const { recibos, marcarCobrado } = useStudio();
  const [cobrando, setCobrando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pendientes = useMemo(
    () => recibos
      .filter((r) => r.socioId === socioId && (COBRABLES as readonly string[]).includes(r.estado))
      .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento)),
    [recibos, socioId],
  );

  const total = pendientes.reduce((s, r) => s + r.importe, 0);
  if (pendientes.length === 0) return null;

  async function cobrar(reciboId: string) {
    setCobrando(reciboId);
    setError(null);
    const r = await marcarCobrado(reciboId, 'EFECTIVO');
    setCobrando(null);
    if (!r.ok) {
      // `cobroRegistrado` distingue «no se cobró» de «se cobró pero falló el
      // sellado de la factura». Decir «no se ha podido cobrar» en el segundo
      // caso haría que alguien lo intentara otra vez y cobrase dos veces.
      setError('cobroRegistrado' in r && r.cobroRegistrado
        ? 'Cobrado. La factura se emitirá en unos minutos.'
        : r.error);
      if (!('cobroRegistrado' in r && r.cobroRegistrado)) return;
    }
    onCobrado();
  }

  return (
    <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <AlertCircle size={15} className="text-warning shrink-0" />
        <p className="text-[13px] font-semibold text-warning">
          Debe {formatEuro(total)}
          {pendientes.length > 1 && ` en ${pendientes.length} recibos`}
        </p>
      </div>
      {error && <p className="text-[12px] text-muted-foreground">{error}</p>}
      {pendientes.map((r) => (
        <div key={r.id} className="flex items-center gap-2">
          <span className="flex-1 min-w-0 text-[12.5px] text-foreground truncate">{r.concepto}</span>
          <span className="text-[13px] font-bold tabular-nums text-foreground shrink-0">{formatEuro(r.importe)}</span>
          <button
            onClick={() => cobrar(r.id)}
            disabled={cobrando !== null}
            className="h-9 px-3 rounded-lg bg-brand text-brand-foreground text-[12.5px] font-bold inline-flex items-center gap-1.5 disabled:opacity-50 shrink-0"
          >
            {cobrando === r.id ? <Loader2 size={13} className="animate-spin" /> : <Banknote size={13} />}
            Efectivo
          </button>
        </div>
      ))}
      <p className="text-[11.5px] text-muted-foreground">
        Solo efectivo desde aquí. Con tarjeta, cóbralo por el datáfono.
      </p>
    </div>
  );
}

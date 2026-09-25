'use client';

import { useEffect, useRef, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { listarDoblesCobros, resolverDobleCobro, type DobleCobroPendiente } from '@/lib/api-client';
import { ANCLA_DECIDIR, invalidarEstadoEstudio } from '@/lib/estado-estudio-cliente';
import { formatEuro } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// PAY-5. El detector encontró un recibo con más de un cargo que tomó dinero: a
// la alumna se le ha cobrado de más. Aquí solo se avisa y se anota; devolver el
// cargo que sobra se hace desde Cobros (Devoluciones), donde ya están el importe
// y la comprobación de Stripe. Sin «todo bien»: la tarjeta no aparece si no hay nada.
//
// Solo se monta con `puedeMoverDinero` (mismo gate que la ruta).
export function DoblesCobrosPorRevisar({ onToast }: { onToast: (m: string) => void }) {
  const [items, setItems] = useState<DobleCobroPendiente[] | null>(null);
  const [resolviendo, setResolviendo] = useState<string | null>(null);
  const enVuelo = useRef(false);

  useEffect(() => {
    let vivo = true;
    void listarDoblesCobros().then((r) => { if (vivo) setItems(r); });
    return () => { vivo = false; };
  }, []);

  async function resolver(id: string) {
    if (enVuelo.current) return;
    enVuelo.current = true;
    setResolviendo(id);
    try {
      if (!(await resolverDobleCobro(id))) { onToast('No se ha podido marcar como resuelto'); return; }
      setItems((prev) => (prev ?? []).filter((x) => x.id !== id));
      invalidarEstadoEstudio();
      onToast('Marcado como resuelto');
    } finally {
      enVuelo.current = false;
      setResolviendo(null);
    }
  }

  if (!items?.length) return null;

  return (
    <div id={ANCLA_DECIDIR.doblesCobrosPorRevisar} tabIndex={-1} data-testid="dobles-cobros"
      className="scroll-mt-20 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
      <div className="mb-1 flex items-center gap-2">
        <CreditCard className="size-4 text-destructive" />
        <p className="text-[13px] font-medium text-foreground">
          {items.length === 1 ? 'Un recibo cobrado dos veces' : `${items.length} recibos cobrados dos veces`}
        </p>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        A la alumna se le ha cobrado de más. Devuelve el cargo que sobra desde Cobros y márcalo aquí.
      </p>
      <ul className="flex flex-col gap-2">
        {items.map((d) => (
          <li key={d.id} data-testid="doble-cobro"
            className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] text-foreground">{d.concepto ?? 'Recibo'}</p>
              <p className="text-[11px] text-muted-foreground">
                {d.cargos} cargos{d.importe != null ? ` · ${formatEuro(d.importe)} cada uno` : ''}
              </p>
            </div>
            <Button size="sm" variant="outline" disabled={resolviendo !== null} className="shrink-0"
              onClick={() => void resolver(d.id)}>
              {resolviendo === d.id ? 'Marcando…' : 'Ya lo he devuelto'}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

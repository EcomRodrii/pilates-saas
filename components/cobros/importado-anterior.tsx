'use client';

// Lo que la propietaria cobró en su software anterior y trajo con «Traer mis
// datos», enseñado AL LADO de lo cobrado en Tentare y no dentro: no son recibos
// (sin factura, sin NIF verificado, ya declarados), así que no suman en
// «Cobrado», que es la cifra que cuadra con facturas y gestoría. Pero no puede
// quedarse fuera de vista: una propietaria que migra 3 meses de pagos y ve
// «Cobrado 0 €» en agosto y septiembre cree que se han perdido.
//
// Regla en docs/cifras-financieras.md («Pagos históricos importados»).

import { formatEuro } from '@/lib/utils';
import type { ResumenPagosHistoricos } from '@/lib/cobros/pagos-historicos';
import { CifraPrivada } from '@/components/ui/cifra-privada';

export function ImportadoDelSoftwareAnterior({ actual, anterior, comparacion, completo = true }: {
  actual: ResumenPagosHistoricos;
  /** El mismo tramo del periodo anterior, o `null` si no se compara. */
  anterior: ResumenPagosHistoricos | null;
  /** «septiembre a estas alturas», o `null`. */
  comparacion: string | null;
  /** `false` si había tantos pagos que la lectura se cortó (la cifra sería corta). */
  completo?: boolean;
}) {
  if (actual.n === 0 && (anterior?.n ?? 0) === 0) return null;
  return (
    <p role="note" data-testid="importado-anterior" className="m-0 px-1 text-xs text-muted-foreground">
      <b className="font-semibold text-foreground">De tu software anterior:</b>{' '}
      <CifraPrivada inline className="font-semibold text-foreground">{formatEuro(actual.total)}</CifraPrivada>
      {' '}en {actual.n} {actual.n === 1 ? 'pago importado' : 'pagos importados'} en este periodo
      {anterior && comparacion && (
        <> (<CifraPrivada inline>{formatEuro(anterior.total)}</CifraPrivada> {comparacion})</>
      )}
      . No suman en «Cobrado»: no son recibos de Tentare, así que no se facturan ni entran en el cierre de la gestoría.
      {!completo && ' Son tantos que esta cifra puede quedarse corta.'}
    </p>
  );
}

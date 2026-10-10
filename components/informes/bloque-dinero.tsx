'use client';

// «Dinero» (rediseño del 2-oct-2026, decisiones 9, 11, 12 y F4): lo COBRADO del
// tramo —nunca «facturado»—, con la misma cifra que «Lo que he cobrado» de Cobros
// (`dineroDelTramo` envuelve `cobradoEnTramo`), por qué entró (el motivo de cada
// cobro), el ingreso medio por clienta que pagó con su base, y las reservas de
// plataformas para cuadrar lo que pagan.

import { useState } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import { cn, formatEuro } from '@/lib/utils';
import { NOMBRE_PLATAFORMA } from '@/lib/plataformas/catalogo';
import type { ResumenPlataforma } from '@/lib/plataformas/informe-origen';
import type { ResumenVentasSinRecibo } from '@/lib/pos/ventas-sin-recibo';
import { diferencia, type DineroDelTramo, type PuntoDelGrafico } from '@/lib/informes/dinero';
import { NOTA_OTROS, ORDEN_MOTIVOS, TEXTO_MOTIVO } from '@/lib/informes/motivo-cobro';
import { CifraPrivada } from '@/components/ui/cifra-privada';
import type { ResumenPagosHistoricos } from '@/lib/cobros/pagos-historicos';
import { ImportadoDelSoftwareAnterior } from '@/components/cobros/importado-anterior';
import { GraficoDinero } from './grafico-dinero';
import { CabeceraBloque, conSignoEuros, Euros, frenteA, tonoDiferencia, type PeriodoInforme } from './piezas';

export function BloqueDinero({ periodo, actual, anterior, puntos, comparacion, ventasSinRecibo, importado, plataformas, onDescargarPlataformas }: {
  periodo: PeriodoInforme;
  actual: DineroDelTramo;
  anterior: DineroDelTramo | null;
  puntos: PuntoDelGrafico[];
  /** «septiembre a estas alturas», o `null`. */
  comparacion: string | null;
  ventasSinRecibo: ResumenVentasSinRecibo;
  /** Lo importado del software anterior en el tramo y en el anterior; `null` si no hay o no se pudo leer. */
  importado: { actual: ResumenPagosHistoricos; anterior: ResumenPagosHistoricos | null; completo: boolean } | null;
  plataformas: ResumenPlataforma[];
  onDescargarPlataformas: () => void;
}) {
  const maxMotivo = Math.max(1, ...ORDEN_MOTIVOS.map(m => actual.porMotivo[m].neto));

  return (
    <section aria-labelledby="informe-dinero" className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <CabeceraBloque id="informe-dinero" titulo="Dinero">
        Lo cobrado, neto de lo devuelto y en el día en que se cobró: la misma cifra que «Lo que he cobrado» en Cobros.
      </CabeceraBloque>

      <GraficoDinero periodo={periodo} puntos={puntos} textoAnterior={comparacion ? `Mismo tramo: ${comparacion}` : null} />

      {importado && (
        <ImportadoDelSoftwareAnterior actual={importado.actual} anterior={importado.anterior} comparacion={comparacion} completo={importado.completo} />
      )}

      {ventasSinRecibo.n > 0 && (
        <p role="note" className="text-[12px] text-muted-foreground">
          {ventasSinRecibo.n === 1 ? 'Una venta' : `${ventasSinRecibo.n} ventas`} de la caja
          {' '}(<CifraPrivada inline className="font-semibold text-foreground">{formatEuro(ventasSinRecibo.total)}</CifraPrivada>)
          {' '}{ventasSinRecibo.n === 1 ? 'se cobró sin recibo y no cuenta' : 'se cobraron sin recibo y no cuentan'} en estas cifras:
          {' '}no {ventasSinRecibo.n === 1 ? 'la sumamos' : 'las sumamos'} para no inventar un cobro que nadie registró.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <h3 className="text-[13.5px] font-semibold text-foreground">Por qué entró</h3>
          <p className="text-[12.5px] text-muted-foreground">Según el motivo de cada cobro. La caja cuenta el ticket entero, lleve lo que lleve.</p>
          <div className="mt-3 space-y-2" data-testid="informe-motivos">
            {ORDEN_MOTIVOS.map(m => {
              const { n, neto } = actual.porMotivo[m];
              const dif = anterior ? diferencia(neto, anterior.porMotivo[m].neto) : null;
              return (
                <div key={m} className={cn('grid grid-cols-[minmax(0,150px)_1fr_auto] items-center gap-x-3 gap-y-0.5 sm:grid-cols-[minmax(0,170px)_1fr_90px_90px]', n === 0 && 'opacity-60')}>
                  <span className="truncate text-[13px] text-foreground" title={m === 'OTROS' ? NOTA_OTROS : undefined}>
                    {TEXTO_MOTIVO[m]} <span className="tabular-nums text-muted-foreground">· {n}</span>
                  </span>
                  <span className="h-2 rounded-full bg-muted">
                    <span className="block h-2 rounded-full bg-foreground/70" style={{ width: `${Math.max(0, (neto / maxMotivo) * 100)}%` }} />
                  </span>
                  <span className="text-right text-[13px] font-semibold tabular-nums text-foreground"><Euros n={neto} /></span>
                  <span className={cn('col-span-3 text-right text-[12px] tabular-nums sm:col-span-1', tonoDiferencia(dif))}>
                    {dif == null ? '' : <CifraPrivada inline>{conSignoEuros(dif)}</CifraPrivada>}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">«Otros»: {NOTA_OTROS.toLowerCase()}.{comparacion && ` La diferencia, ${frenteA(comparacion)}.`}</p>
        </div>

        <div className="rounded-xl border border-border p-4" data-testid="informe-ingreso-medio">
          <h3 className="text-[13.5px] font-semibold text-foreground">Ingreso medio por clienta que pagó</h3>
          <p className="mt-1 text-[24px] font-semibold tabular-nums text-foreground">
            {actual.ingresoMedioPorClienta == null ? '—' : <Euros n={actual.ingresoMedioPorClienta} />}
          </p>
          <p className="text-[12.5px] text-muted-foreground text-pretty">
            {actual.clientasQuePagaron === 0
              ? 'Ninguna clienta ha pagado nada en este periodo.'
              : <>
                  {actual.clientasQuePagaron} {actual.clientasQuePagaron === 1 ? 'clienta pagó' : 'clientas pagaron'}{' '}
                  <Euros n={actual.pagadoPorClientas} />; no cuenta las ventas de caja sin clienta.
                </>}
          </p>
        </div>
      </div>

      {plataformas.length > 0 && <Plataformas filas={plataformas} onDescargar={onDescargarPlataformas} />}
    </section>
  );
}

/** Reservas de ClassPass, USC o Wellhub: una línea, y el detalle si se pide. */
function Plataformas({ filas, onDescargar }: { filas: ResumenPlataforma[]; onDescargar: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const vinieron = filas.reduce((n, f) => n + f.vinieron, 0);
  return (
    <div className="border-t border-border pt-3" data-testid="informe-plataformas">
      <button type="button" onClick={() => setAbierto(a => !a)} aria-expanded={abierto} className="flex w-full flex-wrap items-center gap-x-2 text-left text-[13px] text-foreground">
        <span>Reservas de plataformas: <b className="font-semibold tabular-nums">{vinieron}</b> {vinieron === 1 ? 'vino' : 'vinieron'}</span>
        <span className="inline-flex items-center gap-0.5 font-medium text-brand-medio">
          {abierto ? 'Ocultar detalle' : 'Ver detalle'}<ChevronDown size={14} className={cn('transition-transform', abierto && 'rotate-180')} aria-hidden />
        </span>
      </button>
      {abierto && (
        <div className="mt-3 space-y-3">
          <p className="text-[12.5px] text-muted-foreground">Pagan por visita: cuádralo con «Vinieron».</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-muted-foreground">
                  <th className="pb-2 font-medium">Plataforma</th>
                  <th className="pb-2 text-right font-medium">Vinieron</th>
                  <th className="pb-2 text-right font-medium">No vinieron</th>
                  <th className="pb-2 text-right font-medium">Sin pasar lista</th>
                  <th className="pb-2 text-right font-medium">Canceladas</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(f => (
                  <tr key={f.plataforma} className="border-t border-border">
                    <td className="py-2 font-medium text-foreground">{NOMBRE_PLATAFORMA[f.plataforma]}</td>
                    <td className="py-2 text-right font-semibold tabular-nums text-foreground">{f.vinieron}</td>
                    <td className="py-2 text-right tabular-nums">{f.noVinieron}</td>
                    <td className="py-2 text-right tabular-nums">{f.pendientes}</td>
                    <td className="py-2 text-right tabular-nums">{f.canceladas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={onDescargar} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[13px] font-medium text-foreground hover:bg-muted">
            <Download size={15} aria-hidden />Descargar detalle
          </button>
        </div>
      )}
    </div>
  );
}

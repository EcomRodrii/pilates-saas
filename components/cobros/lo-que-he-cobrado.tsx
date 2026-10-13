'use client';

// «Lo que he cobrado» (decisión 3 de las maquetas del 2-oct-2026): SOLO lo cobrado,
// por hoy, semana o mes, frente al mismo tramo del periodo anterior, y cómo te han
// pagado. Las cifras son las de `cobradoEnTramo` (neto, en el día del COBRO).
//
// La hora sale solo si la guardó la base de datos al cobrar (`horaDelCobro`); un
// cobro antiguo, una domiciliación o una transferencia no la tienen, y no se inventa.
// La búsqueda filtra la lista, nunca las cifras: el total es el del periodo.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ChevronLeft, ChevronRight, Download, Loader2, Wallet } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import type { Recibo } from '@/lib/types';
import { cn, formatEuro } from '@/lib/utils';
import { importeIngresado } from '@/lib/billing/situacion-recibo';
import { resumenVentasSinRecibo } from '@/lib/pos/ventas-sin-recibo';
import {
  ORDEN_COMO_SE_COBRO, TEXTO_COMO_SE_COBRO, cobradoEnTramo, comoSeCobro, horaDelCobro, mismoTramoAnterior, moverPeriodo,
  textoDeLaComparacion, textoDelDia, textoDelPeriodo, tramoVisible, type Periodo,
} from '@/lib/cobros/lo-cobrado';
import { CifraPrivada } from '@/components/ui/cifra-privada';
import { pagosHistoricosEnTramo } from '@/lib/cobros/pagos-historicos';
import { usePagosHistoricos } from '@/lib/cobros/use-pagos-historicos';
import { Buscador, normalizar } from './piezas';
import { ImportadoDelSoftwareAnterior } from './importado-anterior';
import { MenuRecibo } from './menu-recibo';
import type { AccionesRecibo, AvisosCobros } from './use-acciones-recibo';
import type { DatosCobros } from './use-datos-cobros';
import { useDescargaCobrado } from './use-descarga-cobrado';

const PERIODOS: { id: Periodo; texto: string }[] = [
  { id: 'DIA', texto: 'Hoy' },
  { id: 'SEMANA', texto: 'Semana' },
  { id: 'MES', texto: 'Mes' },
];

const POR_PAGINA = 100;

export function LoQueHeCobrado({ datos, acciones, avisos }: { datos: DatosCobros; acciones: AccionesRecibo; avisos: AvisosCobros }) {
  const { recibos, ventasPOS } = useStudio();
  const hoy = datos.hoy;
  const [periodo, setPeriodo] = useState<Periodo>('MES');
  const [ref, setRef] = useState(hoy);
  const [busqueda, setBusqueda] = useState('');
  const [mostrar, setMostrar] = useState(POR_PAGINA);

  // `ref` siempre cae en un periodo ya empezado (las flechas no van al futuro).
  const visible = useMemo(() => tramoVisible(periodo, ref, hoy) ?? tramoVisible(periodo, hoy, hoy)!, [periodo, ref, hoy]);
  const haySiguiente = moverPeriodo(periodo, ref, 1) <= hoy;

  const actual = useMemo(() => cobradoEnTramo(recibos, visible), [recibos, visible]);
  const anterior = useMemo(() => {
    const t = mismoTramoAnterior(periodo, visible);
    return t ? cobradoEnTramo(recibos, t).neto : null;
  }, [recibos, periodo, visible]);
  const comparacion = textoDeLaComparacion(periodo, visible, hoy);
  const ventasSinRecibo = useMemo(() => resumenVentasSinRecibo(ventasPOS), [ventasPOS]);
  // Lo importado del software anterior: aparte del «Cobrado» (no son recibos).
  const importado = usePagosHistoricos();
  const importadoActual = useMemo(() => (importado ? pagosHistoricosEnTramo(importado.dias, visible) : null), [importado, visible]);
  const importadoAnterior = useMemo(() => {
    const t = mismoTramoAnterior(periodo, visible);
    return importado && t ? pagosHistoricosEnTramo(importado.dias, t) : null;
  }, [importado, periodo, visible]);

  // La lista: por día, del más reciente al más antiguo; dentro del día, por hora.
  const dias = useMemo(() => {
    const t = normalizar(busqueda.trim());
    const lista = actual.recibos.filter(r => !t || normalizar(`${datos.nombreDe(r.socioId)} ${r.concepto}`).includes(t));
    lista.sort((a, b) => (b.fechaCobro ?? '').localeCompare(a.fechaCobro ?? '') || (b.cobradoEn ?? '').localeCompare(a.cobradoEn ?? ''));
    const grupos: { dia: string; recibos: Recibo[] }[] = [];
    for (const r of lista.slice(0, mostrar)) {
      const dia = (r.fechaCobro ?? '').slice(0, 10);
      const g = grupos[grupos.length - 1];
      if (g?.dia === dia) g.recibos.push(r); else grupos.push({ dia, recibos: [r] });
    }
    return { grupos, total: lista.length };
  }, [actual.recibos, busqueda, mostrar, datos]);

  function elegirPeriodo(p: Periodo) { setPeriodo(p); setRef(hoy); setMostrar(POR_PAGINA); }
  function mover(paso: -1 | 1) { setRef(moverPeriodo(periodo, ref, paso)); setMostrar(POR_PAGINA); }

  // «Descargar para la gestoría»: lo COBRADO del periodo que se ve. Sin búsqueda:
  // la gestoría necesita todo.
  const descargas = useDescargaCobrado(avisos);
  const descarga = descargas.fase(visible);

  const diferencia = anterior != null ? Math.round((actual.neto - anterior) * 100) / 100 : null;
  const maxComo = Math.max(1, ...ORDEN_COMO_SE_COBRO.map(c => actual.porComo[c].neto));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-0.5 rounded-xl bg-muted p-1" role="group" aria-label="Periodo">
          {PERIODOS.map(p => (
            <button
              key={p.id} type="button" onClick={() => elegirPeriodo(p.id)} aria-pressed={periodo === p.id}
              className={cn('min-h-8 rounded-lg px-3 text-[13px] font-medium transition-colors', periodo === p.id ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
            >
              {p.texto}
            </button>
          ))}
        </div>
        <div className="inline-flex items-center rounded-lg border border-border bg-card">
          <button type="button" onClick={() => mover(-1)} aria-label="Periodo anterior" className="flex size-9 items-center justify-center text-muted-foreground hover:text-foreground">
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-28 border-x border-border px-3 py-1.5 text-center text-[13px] font-semibold text-foreground" aria-live="polite">
            {textoDelPeriodo(periodo, ref, hoy)}
          </span>
          <button type="button" onClick={() => mover(1)} disabled={!haySiguiente} aria-label="Periodo siguiente" className="flex size-9 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30">
            <ChevronRight size={16} />
          </button>
        </div>
        <span className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          <Buscador valor={busqueda} onCambio={setBusqueda} texto="Buscar clienta o concepto" className="min-w-0 flex-1 sm:w-[250px] sm:flex-none" />
          <Link href="/pos" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted">
            <Wallet size={15} aria-hidden />Caja
          </Link>
          <button
            type="button" onClick={() => void descargas.descargar(visible)} disabled={descargas.ocupado}
            className={cn(
              'inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors',
              descarga === 'done' ? 'border-success/30 bg-success/10 text-success' : 'border-border bg-card text-foreground hover:bg-muted',
            )}
          >
            {descarga === 'loading' ? <Loader2 size={15} className="animate-spin" aria-hidden /> : descarga === 'done' ? <CheckCircle2 size={15} aria-hidden /> : <Download size={15} aria-hidden />}
            {descarga === 'loading' ? 'Preparando…' : descarga === 'done' ? 'Descargado' : 'Descargar para la gestoría'}
          </button>
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-1">
        <div>
          <p className="text-[12.5px] text-muted-foreground">Cobrado · neto, ya restado lo devuelto</p>
          <p className="text-[34px] font-semibold leading-tight tracking-tight tabular-nums text-foreground" data-testid="cobrado-neto">
            <CifraPrivada inline>{formatEuro(actual.neto)}</CifraPrivada>
          </p>
        </div>
        <p className="pb-1.5 text-[13.5px] text-muted-foreground">
          {diferencia != null && comparacion && (
            <>
              <b className={cn('font-semibold tabular-nums', diferencia >= 0 ? 'text-success' : 'text-destructive')}>
                <CifraPrivada inline>{`${diferencia >= 0 ? '+' : '−'}${formatEuro(Math.abs(diferencia))}`}</CifraPrivada>
              </b>
              {' '}frente a {comparacion} (<CifraPrivada inline>{formatEuro(anterior ?? 0)}</CifraPrivada>) ·{' '}
            </>
          )}
          {actual.nCobros} {actual.nCobros === 1 ? 'cobro' : 'cobros'}
          {actual.nConDevolucion > 0 && ` · ${actual.nConDevolucion} con devolución`}
        </p>
      </div>

      {importadoActual && (
        <ImportadoDelSoftwareAnterior actual={importadoActual} anterior={importadoAnterior} comparacion={comparacion} completo={importado?.completo} />
      )}

      {ventasSinRecibo.n > 0 && (
        <p role="note" className="m-0 px-1 text-xs text-muted-foreground">
          {ventasSinRecibo.n === 1 ? 'Una venta' : `${ventasSinRecibo.n} ventas`} de la caja
          {' '}(<CifraPrivada inline className="font-semibold text-foreground">{formatEuro(ventasSinRecibo.total)}</CifraPrivada>)
          {' '}{ventasSinRecibo.n === 1 ? 'se cobró sin recibo y no cuenta' : 'se cobraron sin recibo y no cuentan'} en estas cifras
          {' '}ni en Inicio o Informes: no {ventasSinRecibo.n === 1 ? 'la sumamos' : 'las sumamos'} para no inventar un cobro que nadie registró.
        </p>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section aria-label="Cobros del periodo" className="overflow-hidden rounded-2xl border border-border bg-card">
          {dias.total === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
              {busqueda ? 'Ningún cobro coincide con la búsqueda.' : 'No hay cobros en este periodo.'}
            </p>
          ) : (
            <>
              {dias.grupos.map(g => {
                const totalDia = actual.porDia.get(g.dia) ?? 0;
                return (
                  <div key={g.dia}>
                    <div className="flex items-center justify-between border-y border-border bg-muted/40 px-4 py-2 first:border-t-0">
                      <span className="text-[12.5px] font-semibold text-foreground">{textoDelDia(g.dia, hoy)}</span>
                      <span className="text-[12.5px] font-semibold tabular-nums text-foreground"><CifraPrivada inline>{formatEuro(totalDia)}</CifraPrivada></span>
                    </div>
                    <ul className="divide-y divide-border">
                      {g.recibos.map(r => <FilaCobro key={r.id} r={r} datos={datos} acciones={acciones} />)}
                    </ul>
                  </div>
                );
              })}
              {dias.total > mostrar && (
                <button type="button" onClick={() => setMostrar(m => m + POR_PAGINA)} className="w-full border-t border-border py-2.5 text-[13px] font-medium text-foreground hover:bg-muted">
                  Ver más ({dias.total - mostrar})
                </button>
              )}
            </>
          )}
        </section>

        <section aria-label="Cómo te han pagado" className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-[13.5px] font-semibold text-foreground">Cómo te han pagado</h2>
          <p className="text-[12.5px] text-muted-foreground">Para cuadrar la caja y el banco. Lo devuelto se resta en su método.</p>
          <div className="mt-3 space-y-2">
            {ORDEN_COMO_SE_COBRO.filter(c => c !== 'SIN_ESPECIFICAR' || actual.porComo[c].n > 0).map(c => {
              const { n, neto } = actual.porComo[c];
              return (
                <div key={c} className={cn('grid grid-cols-[minmax(0,175px)_1fr_76px] items-center gap-3', n === 0 && 'opacity-60')}>
                  <span className="truncate text-[13px] text-foreground">{TEXTO_COMO_SE_COBRO[c]} <span className="tabular-nums text-muted-foreground">· {n}</span></span>
                  <span className="h-2 rounded-full bg-muted">
                    <span className="block h-2 rounded-full bg-foreground/70" style={{ width: `${Math.max(0, (neto / maxComo) * 100)}%` }} />
                  </span>
                  <span className="text-right text-[13px] font-semibold tabular-nums text-foreground"><CifraPrivada inline>{formatEuro(neto)}</CifraPrivada></span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function FilaCobro({ r, datos, acciones }: { r: Recibo; datos: DatosCobros; acciones: AccionesRecibo }) {
  const hora = horaDelCobro(r);
  const neto = importeIngresado(r);
  const devuelto = Number(r.importeDevuelto ?? 0);
  return (
    <li data-recibo={r.id} className="grid grid-cols-[44px_minmax(0,1fr)_auto_auto] items-center gap-x-3 px-4 py-2.5 md:grid-cols-[44px_minmax(0,1fr)_170px_90px_auto]">
      <span className="text-[12.5px] tabular-nums text-muted-foreground">{hora ?? '—'}</span>
      <div className="min-w-0">
        {/* En el móvil el nombre no se corta: es lo que dice de quién es el cobro. */}
        <p className="text-[13.5px] font-medium text-foreground md:truncate">{datos.nombreDe(r.socioId)}</p>
        <p className="text-[12.5px] text-muted-foreground md:truncate">
          {r.concepto}
          <span className="md:hidden"> · {TEXTO_COMO_SE_COBRO[comoSeCobro(r)]}</span>
        </p>
      </div>
      <span className="hidden text-[12.5px] text-muted-foreground md:block">{TEXTO_COMO_SE_COBRO[comoSeCobro(r)]}</span>
      <span className="text-right">
        <span className="block text-[13.5px] font-semibold tabular-nums text-foreground"><CifraPrivada inline>{formatEuro(neto)}</CifraPrivada></span>
        {devuelto > 0 && (
          <span className="block text-[11.5px] tabular-nums text-destructive">devuelto <CifraPrivada inline>{formatEuro(devuelto)}</CifraPrivada></span>
        )}
      </span>
      <MenuRecibo recibo={r} datos={datos} acciones={acciones} />
    </li>
  );
}

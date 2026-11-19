'use client';

// El bloque grande del Resumen de Informes con el marco a sangre (`SHELL_NUEVO`), con la estructura del
// de «Informes y estadísticas» de Shopify: a la izquierda una tarjeta con título (subrayado punteado: es
// una definición), la cifra grande, un gráfico de línea con rejilla, eje de euros y leyenda de puntos, y a
// la derecha el desglose en una lista de filas alternas con enlaces azules. Los datos son los de siempre
// (`dineroDelTramo` / `serieDelGrafico`): no hay ninguna cifra nueva, solo otra forma de ponerlas.

import { useEffect, useRef, useState } from 'react';
import { formatEuro } from '@/lib/utils';
import { CifraPrivada } from '@/components/ui/cifra-privada';
import type { DineroDelTramo, PuntoDelGrafico } from '@/lib/informes/dinero';
import { ORDEN_MOTIVOS, TEXTO_MOTIVO } from '@/lib/informes/motivo-cobro';
import { etiquetaEuros, marcasDelEje, techoDelEje } from '@/lib/informes/eje-euros';
import { Euros, type PeriodoInforme } from './piezas';

const ALTO = 220;
const IZQ = 44;
const MARCAS = 4;
const AZUL = 'var(--t-blue-500)';
const AZUL_SUAVE = 'color-mix(in srgb, var(--t-blue-500) 45%, white)';

function useAncho() {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setAncho(Math.floor(el.clientWidth));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ancho };
}

function GraficoLinea({ puntos, textoAnterior }: { puntos: PuntoDelGrafico[]; textoAnterior: string | null }) {
  const { ref, ancho } = useAncho();
  const techo = techoDelEje(puntos.flatMap(p => [p.actual ?? 0, p.anterior ?? 0]), MARCAS);
  const paso = Math.max(1, (ancho - IZQ - 8) / Math.max(1, puntos.length - 1));
  const x = (i: number) => IZQ + i * paso;
  const y = (v: number) => ALTO - (v / techo) * ALTO;
  const lleva = puntos.filter(p => p.actual != null);
  const ultimo = puntos.reduce((n, p, i) => (p.actual != null ? i : n), -1);
  const trazoActual = puntos.map((p, i) => (p.actual == null ? null : `${x(i)},${y(p.actual)}`)).filter(Boolean).join(' ');
  const trazoAnterior = puntos.map((p, i) => (p.anterior == null ? null : `${x(i)},${y(p.anterior)}`)).filter(Boolean).join(' ');
  const salto = Math.max(1, Math.ceil(puntos.length / 8));
  return (
    <div>
      <div ref={ref} className="w-full">
        {ancho > 0 && (
          <CifraPrivada>
            <svg width={ancho} height={ALTO + 34} viewBox={`0 -8 ${ancho} ${ALTO + 34}`} role="img" aria-label="Lo cobrado a lo largo del periodo" style={{ display: 'block' }}>
              {marcasDelEje(techo, MARCAS).map(v => (
                <g key={v}>
                  <line x1={IZQ} y1={y(v)} x2={ancho} y2={y(v)} stroke="#0000000f" strokeWidth="1" />
                  <text x={IZQ - 8} y={y(v) + 3.5} textAnchor="end" fontSize="11" fill="#707070">{etiquetaEuros(v)}</text>
                </g>
              ))}
              {puntos.map((p, i) => (i % salto === 0 || i === puntos.length - 1) && (
                <text key={p.clave} x={x(i)} y={ALTO + 18} textAnchor="middle" fontSize="11" fill="#707070">{p.etiqueta}</text>
              ))}
              {trazoAnterior && <polyline points={trazoAnterior} fill="none" stroke={AZUL_SUAVE} strokeWidth="1.5" strokeDasharray="4 3" strokeLinejoin="round" />}
              {/* Lo que aún no ha llegado: la línea sigue punteada hasta el final, como en Shopify. */}
              {ultimo >= 0 && ultimo < puntos.length - 1 && (
                <line x1={x(ultimo)} y1={y(puntos[ultimo].actual ?? 0)} x2={x(puntos.length - 1)} y2={y(puntos[ultimo].actual ?? 0)} stroke={AZUL} strokeWidth="1.5" strokeDasharray="2 4" strokeLinecap="round" />
              )}
              {trazoActual && <polyline points={trazoActual} fill="none" stroke={AZUL} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
              {lleva.length === 1 && ultimo >= 0 && <circle cx={x(ultimo)} cy={y(puntos[ultimo].actual ?? 0)} r="3" fill={AZUL} />}
            </svg>
          </CifraPrivada>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[12px] text-[#4a4a4a]">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: AZUL }} />Este periodo</span>
        {textoAnterior && <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: AZUL_SUAVE }} />{textoAnterior}</span>}
      </div>
    </div>
  );
}

const TARJETA = 'rounded-[20px] bg-card shadow-[0_0_2px_#0000003d,0_2px_12px_#00000005,0_4px_16px_#00000005,0_4px_48px_#00000005]';

export function ResumenCobrado({ periodo, puntos, actual, comparacion, onIrADinero }: {
  periodo: PeriodoInforme;
  puntos: PuntoDelGrafico[];
  actual: DineroDelTramo;
  /** «septiembre a estas alturas», o `null`. */
  comparacion: string | null;
  onIrADinero: () => void;
}) {
  void periodo;
  const total = ORDEN_MOTIVOS.reduce((s, m) => s + actual.porMotivo[m].neto, 0);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" data-testid="resumen-cobrado">
      <section className={`${TARJETA} p-4`} aria-label="Cobrado a lo largo del tiempo">
        <h3 className="inline-block border-b border-dotted border-[#707070] text-[13px] font-semibold text-foreground">Cobrado a lo largo del tiempo</h3>
        <p className="mt-1 text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-foreground"><Euros n={total} /></p>
        <div className="mt-3"><GraficoLinea puntos={puntos} textoAnterior={comparacion ? `Mismo tramo: ${comparacion}` : null} /></div>
      </section>
      <section className={`${TARJETA} p-4`} aria-label="Desglose de lo cobrado">
        <h3 className="inline-block border-b border-dotted border-[#707070] text-[13px] font-semibold text-foreground">Desglose de lo cobrado</h3>
        <ul className="mt-3">
          {ORDEN_MOTIVOS.map(m => (
            <li key={m} className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-3 text-[13px] odd:bg-[#f7f7f7]">
              <button type="button" onClick={onIrADinero} className="truncate text-left font-normal text-[color:var(--t-blue-500)] hover:underline">{TEXTO_MOTIVO[m]}</button>
              <span className="tabular-nums text-foreground"><Euros n={actual.porMotivo[m].neto} /></span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-3 text-[13px] font-semibold odd:bg-[#f7f7f7]">
            <span>Total cobrado</span>
            <span className="tabular-nums" title={formatEuro(total)}><Euros n={total} /></span>
          </li>
        </ul>
      </section>
    </div>
  );
}

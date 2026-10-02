'use client';

// El gráfico de «Dinero»: barras de UN color (lo cobrado en cada hueco) y una
// línea discontinua con el mismo hueco del periodo anterior. Antes las barras se
// pintaban verdes, ámbar o rojas según si subían frente a la barra de AL LADO:
// el lunes «decrecía» frente al domingo, que es comparar dos cosas que no se
// parecen. La comparación honesta es la línea.

import { useEffect, useRef, useState } from 'react';
import type { PeriodoInforme } from './piezas';
import { formatEuro } from '@/lib/utils';
import type { PuntoDelGrafico } from '@/lib/informes/dinero';
import { etiquetaEuros, marcasDelEje, techoDelEje } from '@/lib/informes/eje-euros';
import { CifraPrivada } from '@/components/ui/cifra-privada';

const ALTO = 160;
const IZQ = 44;
/** Lo mínimo que necesita cada hueco; si no cabe, el gráfico se desplaza en horizontal. */
const PASO_MINIMO: Record<PeriodoInforme, number> = { SEMANA: 40, MES: 14, TRIMESTRE: 80, ANIO: 28 };
const MARCAS = 4;

/**
 * El ancho real del contenedor, en píxeles. El SVG se dibuja a ese ancho y no
 * escalando un `viewBox`: escalado, en un escritorio ancho las letras del eje
 * salían al doble y el gráfico medía 400 px de alto; en el móvil, a la mitad.
 */
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

export function GraficoDinero({ periodo, puntos, textoAnterior }: { periodo: PeriodoInforme; puntos: PuntoDelGrafico[]; textoAnterior: string | null }) {
  const { ref, ancho: disponible } = useAncho();
  const paso = Math.max(PASO_MINIMO[periodo], (disponible - IZQ) / Math.max(1, puntos.length));
  const barra = Math.min(40, Math.max(5, Math.round(paso * 0.62)));
  const ancho = IZQ + puntos.length * paso;
  const techo = techoDelEje(puntos.flatMap(p => [p.actual ?? 0, p.anterior ?? 0]), MARCAS);
  const y = (v: number) => ALTO - (v / techo) * ALTO;
  const saltoEtiqueta = periodo === 'MES' ? 5 : 1;
  const linea = puntos
    .map((p, i) => (p.anterior == null ? null : `${IZQ + i * paso + paso / 2},${y(p.anterior)}`))
    .filter(Boolean)
    .join(' ');

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-[12px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-foreground/70" aria-hidden />Cobrado</span>
        {textoAnterior && (
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="4" aria-hidden><line x1="0" y1="2" x2="18" y2="2" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeDasharray="3 3" /></svg>
            {textoAnterior}
          </span>
        )}
      </div>
      <div ref={ref} className="w-full">
      <CifraPrivada className="overflow-x-auto">
        {disponible > 0 && <svg
          viewBox={`0 -8 ${ancho} ${ALTO + 30}`}
          width={ancho}
          height={ALTO + 30}
          style={{ display: 'block' }}
          role="img"
          aria-label="Lo cobrado en cada tramo del periodo, con el periodo anterior en línea discontinua"
        >
          {marcasDelEje(techo, MARCAS).map(v => (
            <g key={v}>
              <line x1={IZQ} y1={y(v)} x2={ancho} y2={y(v)} stroke="var(--border)" strokeWidth="1" />
              <text x={IZQ - 6} y={y(v) + 3} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">{etiquetaEuros(v)}</text>
            </g>
          ))}
          {puntos.map((p, i) => {
            const x = IZQ + i * paso + (paso - barra) / 2;
            const v = p.actual ?? 0;
            const alto = p.actual == null ? 0 : Math.max(v > 0 ? 2 : 0, (v / techo) * ALTO);
            return (
              <g key={p.clave}>
                {alto > 0 && (
                  <rect x={x} y={ALTO - alto} width={barra} height={alto} rx={2} fill="var(--foreground)" opacity={0.7}>
                    <title>{`${p.etiqueta}: ${formatEuro(v)}${p.anterior != null ? ` (antes ${formatEuro(p.anterior)})` : ''}`}</title>
                  </rect>
                )}
                {(i % saltoEtiqueta === 0 || i === puntos.length - 1) && (
                  <text x={IZQ + i * paso + paso / 2} y={ALTO + 16} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">{p.etiqueta}</text>
                )}
              </g>
            );
          })}
          {linea && <polyline points={linea} fill="none" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeDasharray="4 3" />}
          <line x1={IZQ} y1={ALTO} x2={ancho} y2={ALTO} stroke="var(--border)" strokeWidth="1" />
        </svg>}
      </CifraPrivada>
      </div>
    </div>
  );
}

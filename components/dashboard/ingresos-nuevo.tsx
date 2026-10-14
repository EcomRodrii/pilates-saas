'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Los ingresos del panel nuevo, en un sitio: la gráfica de lo cobrado cada mes y
// la comparación «+12 % vs sep. a estas alturas». Salieron de la home nueva
// (`resumen-nuevo.tsx`) para que Cobros enseñe EXACTAMENTE la misma cifra y la
// misma curva que el Resumen: dos pantallas con dos cuentas para lo mismo es
// como empiezan las «cifras que no cuadran» (F0, `docs/cifras-financieras.md`).
//
// Los números salen de `lib/inicio/cifras.ts` (`ingresosPorMes`, y el «al día»
// lo calcula quien la pinta con `ingresosAlDia`): neto de lo devuelto, en el mes
// del COBRO, leído con `situacion-recibo.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState, type ReactNode } from 'react';
import { CifraPrivada } from '@/components/ui/cifra-privada';
import { GraficaArea } from '@/components/dashboard/grafica-area';
import { MESES_LARGOS, ingresosPorMes } from '@/lib/inicio/cifras';
import type { ReciboParaCifras } from '@/lib/billing/situacion-recibo';
import { Pildoras, TarjetaGrafica, VerMas } from '@/components/dashboard/vivo';

/** «1.235 €»: la cifra grande va sin céntimos; el detalle (las listas) los lleva. */
export function formatoEuros(n: number): string {
  return `${n.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`;
}

export function formatoEjeEuros(n: number): string {
  return n >= 1000 ? `${(n / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} k€` : `${n.toLocaleString('es-ES')} €`;
}

/** «octubre de 2026» de una clave 'YYYY-MM'. */
export const nombreMes = (clave: string) => `${MESES_LARGOS[Number(clave.slice(5, 7)) - 1]} de ${clave.slice(0, 4)}`;
/** «oct» de una clave 'YYYY-MM', para el eje. */
export const ejeMes = (clave: string) => MESES_LARGOS[Number(clave.slice(5, 7)) - 1].slice(0, 3);

/** Lo que va al lado del número de ingresos: la variación y contra qué. */
export function ladoIngresos(actual: number, anterior: number, mesAnterior: string): { arriba?: ReactNode; abajo: ReactNode } {
  if (actual === 0 && anterior === 0) return { abajo: 'Aún no has cobrado nada este mes' };
  if (anterior === 0) return { abajo: `Sin cobros en ${mesAnterior} a estas alturas` };
  const pct = Math.round(((actual - anterior) / anterior) * 100);
  const color = pct > 0 ? 'var(--success)' : pct < 0 ? 'var(--destructive)' : 'var(--muted-foreground)';
  return {
    arriba: <span style={{ color }}>{pct > 0 ? '+' : ''}{pct} %</span>,
    abajo: `vs ${mesAnterior.slice(0, 3)}. a estas alturas`,
  };
}

/**
 * La gráfica de lo cobrado cada mes, como la de Bonsai: cifra grande del mes con
 * su comparación, píldoras de periodo y la curva rellena. `pie`: lo de debajo
 * («Ver informe» en el Resumen); si no se da, el enlace de `href`.
 */
export function GraficaIngresos({ recibos, hoy, alDia, href, pie }: {
  recibos: readonly ReciboParaCifras[];
  hoy: string;
  alDia: { actual: number; anterior: number; mesAnterior: string };
  href: string | null;
  pie?: ReactNode;
}) {
  const [meses, setMeses] = useState<3 | 6 | 12>(6);
  const serie = useMemo(() => ingresosPorMes(recibos, hoy, meses), [recibos, hoy, meses]);
  const pct = alDia.anterior > 0 ? Math.round(((alDia.actual - alDia.anterior) / alDia.anterior) * 100) : null;
  return (
    <TarjetaGrafica
      id="grafica-ingresos"
      titulo="Ingresos"
      sub="Lo cobrado cada mes, con IVA y ya restado lo devuelto"
      cifra={<CifraPrivada inline>{formatoEuros(alDia.actual)}</CifraPrivada>}
      comparacion={pct === null ? 'este mes' : (
        <><span className="font-semibold" style={{ color: pct > 0 ? 'var(--success)' : pct < 0 ? 'var(--destructive)' : 'var(--muted-foreground)' }}>{pct > 0 ? '+' : ''}{pct} %</span> vs {alDia.mesAnterior} a estas alturas</>
      )}
      controles={<Pildoras opciones={[{ valor: 3, label: '3 meses' }, { valor: 6, label: '6 meses' }, { valor: 12, label: '1 año' }]} valor={meses} onCambio={setMeses} />}
      pie={pie ?? (href ? <VerMas href={href} label="Ver informe" /> : null)}
    >
      <CifraPrivada>
        <GraficaArea
          titulo="Ingresos por mes"
          color="var(--cat-2)"
          puntos={serie.map(m => ({ eje: ejeMes(m.clave), nombre: nombreMes(m.clave) + (m.actual ? ' (va a medias)' : ''), valor: m.total }))}
          formato={formatoEuros}
          formatoEje={formatoEjeEuros}
          vacio="Aquí verás lo que cobras cada mes en cuanto cobres la primera cuota o el primer bono."
        />
      </CifraPrivada>
    </TarjetaGrafica>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// El bloque «Dinero» de Informes (rediseño del 2-oct-2026, decisión F1): se
// calcula en el navegador sobre el array `recibos` del contexto, con la MISMA
// función que «Lo que he cobrado» de Cobros (`cobradoEnTramo`). Así el titular
// cuadra al céntimo con Cobros por construcción —no por casualidad de dos
// consultas distintas— y respeta la sede activa igual que el resto del panel.
//
// Lo que se añade encima: el desglose por MOTIVO del cobro (`motivo-cobro.ts`),
// la serie para el gráfico (por día en semana y mes, por mes en trimestre y año)
// y el ingreso medio por clienta que pagó, con su base.
//
// Puro: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { aCentimos, importeIngresado } from '../billing/situacion-recibo.ts';
import { cobradoEnTramo, sumarDias, tramo, type Periodo, type ReciboCobrado, type Tramo } from '../cobros/lo-cobrado.ts';
import { motivoDelCobro, ORDEN_MOTIVOS, type MotivoCobro, type ReciboConMotivo, type TipoDePlanDe } from './motivo-cobro.ts';

export interface ReciboDeInforme extends ReciboCobrado, ReciboConMotivo {
  socioId?: string | null;
}

export interface DineroDelTramo {
  /** Neto cobrado: el mismo número que `cobradoEnTramo(...).neto`. */
  neto: number;
  nCobros: number;
  /** Neto y número de cobros por motivo. Suman el total. */
  porMotivo: Record<MotivoCobro, { n: number; neto: number }>;
  /** Neto por día ('YYYY-MM-DD') en semana y mes; por mes ('YYYY-MM') en trimestre y año. */
  serie: Map<string, number>;
  /** Lo pagado por recibos CON clienta (las ventas de caja sin clienta no cuentan). */
  pagadoPorClientas: number;
  /** Clientas distintas que dejaron dinero en el tramo. */
  clientasQuePagaron: number;
  /** `pagadoPorClientas ÷ clientasQuePagaron`; `null` si no pagó ninguna. */
  ingresoMedioPorClienta: number | null;
}

/** Semana y mes van por día; trimestre y año, por mes. */
export const porMeses = (periodo: Periodo) => periodo === 'TRIMESTRE' || periodo === 'ANIO';

export function dineroDelTramo<R extends ReciboDeInforme>(
  recibos: readonly R[], t: Tramo, ctx: { periodo: Periodo; tipoDePlanDe: TipoDePlanDe },
): DineroDelTramo {
  const cobrado = cobradoEnTramo(recibos, t);
  const porMotivo = Object.fromEntries(ORDEN_MOTIVOS.map(m => [m, { n: 0, neto: 0 }])) as Record<MotivoCobro, { n: number; neto: number }>;
  const serie = new Map<string, number>();
  const mensual = porMeses(ctx.periodo);
  const clientas = new Set<string>();
  let pagadoPorClientas = 0;

  for (const r of cobrado.recibos) {
    const n = importeIngresado(r);
    if (n <= 0) continue;
    const m = porMotivo[motivoDelCobro(r, ctx.tipoDePlanDe)];
    m.n++;
    m.neto = aCentimos(m.neto + n);
    const dia = (r.fechaCobro ?? '').slice(0, 10);
    const clave = mensual ? dia.slice(0, 7) : dia;
    serie.set(clave, aCentimos((serie.get(clave) ?? 0) + n));
    if (r.socioId) {
      clientas.add(r.socioId);
      pagadoPorClientas += n;
    }
  }

  pagadoPorClientas = aCentimos(pagadoPorClientas);
  return {
    neto: cobrado.neto,
    nCobros: cobrado.nCobros,
    porMotivo,
    serie,
    pagadoPorClientas,
    clientasQuePagaron: clientas.size,
    ingresoMedioPorClienta: clientas.size > 0 ? aCentimos(pagadoPorClientas / clientas.size) : null,
  };
}

// ── El gráfico ──────────────────────────────────────────────────────────────

export interface PuntoDelGrafico {
  /** 'YYYY-MM-DD' o 'YYYY-MM'. */
  clave: string;
  /** «1», «lun», «ene»: lo que va debajo del eje. */
  etiqueta: string;
  /** `null` si ese hueco aún no ha llegado (el periodo va a medias). */
  actual: number | null;
  /** El mismo hueco del periodo anterior; `null` si queda fuera del tramo con el que se compara. */
  anterior: number | null;
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_CORTOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

/** Los huecos del periodo ENTERO ('YYYY-MM-DD' o 'YYYY-MM'), en orden. */
export function huecosDelPeriodo(periodo: Periodo, ref: string): string[] {
  const t = tramo(periodo, ref);
  const out: string[] = [];
  if (porMeses(periodo)) {
    const y = Number(t.desde.slice(0, 4)), m0 = Number(t.desde.slice(5, 7)), m1 = Number(t.hasta.slice(5, 7));
    for (let m = m0; m <= m1; m++) out.push(`${y}-${String(m).padStart(2, '0')}`);
  } else {
    for (let d = t.desde; d <= t.hasta; d = sumarDias(d, 1)) out.push(d);
  }
  return out;
}

/** Los huecos que caen dentro de un tramo (el periodo puede ir a medias). */
function clavesDelTramo(periodo: Periodo, t: Tramo): string[] {
  const [a, b] = porMeses(periodo) ? [t.desde.slice(0, 7), t.hasta.slice(0, 7)] : [t.desde, t.hasta];
  return huecosDelPeriodo(periodo, t.desde).filter(k => k >= a && k <= b);
}

/**
 * Un punto por hueco del periodo entero: lo de este periodo hasta donde se ve, y
 * el mismo hueco del anterior (por POSICIÓN: el día 3 frente al día 3, el 2.º mes
 * frente al 2.º mes) hasta donde llega el tramo con el que se compara.
 */
export function serieDelGrafico(
  periodo: Periodo, visible: Tramo, actual: DineroDelTramo, anterior: { tramo: Tramo; dinero: DineroDelTramo } | null,
): PuntoDelGrafico[] {
  const huecos = huecosDelPeriodo(periodo, visible.desde);
  const vistos = new Set(clavesDelTramo(periodo, visible));
  const delAnterior = anterior ? clavesDelTramo(periodo, anterior.tramo) : [];
  return huecos.map((clave, i) => {
    const claveAnterior = delAnterior[i];
    return {
      clave,
      etiqueta: periodo === 'SEMANA' ? DIAS_CORTOS[i] : porMeses(periodo) ? MESES_CORTOS[Number(clave.slice(5, 7)) - 1] : String(Number(clave.slice(8, 10))),
      actual: vistos.has(clave) ? (actual.serie.get(clave) ?? 0) : null,
      anterior: anterior && claveAnterior ? (anterior.dinero.serie.get(claveAnterior) ?? 0) : null,
    };
  });
}

/** La diferencia en euros, ya en céntimos (`null` si no hay con qué comparar). */
export const diferencia = (actual: number, anterior: number | null | undefined): number | null =>
  anterior == null ? null : aCentimos(actual - anterior);

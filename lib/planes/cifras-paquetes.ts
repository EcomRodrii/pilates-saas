// ─────────────────────────────────────────────────────────────────────────────
// Las cifras de Paquetes en el panel nuevo (14-oct-2026) y lo que enseña cada
// tarjeta de tarifa.
//
// «Vigente» = ACTIVA y sin fecha de fin pasada: el mismo criterio que el
// ingreso recurrente del Resumen (hallazgo A del dunning, 10-ago-2026): una
// cuota ACTIVA con la fecha de fin ya pasada está esperando su renovación o su
// cancelación, y no se cuenta como ingreso que vuelve cada mes.
//
// El ingreso recurrente es SOLO de cuotas (A-16: un bono es un pago único) y va
// por mes con `precioMensualDeCuota`: una trimestral de 240 € son 80 € al mes,
// no 240.
//
// Puro (sin `@/`): se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { nombrePeriodo, precioMensualDeCuota } from '../bono-logic.ts';
import { mesAnterior } from '../billing/situacion-recibo.ts';
import { MESES_LARGOS } from '../inicio/cifras.ts';

export interface PlanParaCifras {
  id: string;
  tipo: string;
  precio: number;
  activo: boolean;
  periodicidadMeses?: number | null;
}

export interface SuscripcionParaCifras {
  planId: string;
  socioId: string;
  estado: string;
  fechaInicio: string;
  fechaFin: string | null;
}

/** ACTIVA y sin la fecha de fin ya pasada (día del estudio, 'YYYY-MM-DD'). */
export function suscripcionVigente(s: Pick<SuscripcionParaCifras, 'estado' | 'fechaFin'>, hoy: string): boolean {
  return s.estado === 'ACTIVA' && (!s.fechaFin || s.fechaFin.slice(0, 10) >= hoy);
}

/** Cuántas personas DISTINTAS tienen vigente cada tarifa (una que compró dos veces el mismo bono cuenta una). */
export function clientasPorPlan(suscripciones: readonly SuscripcionParaCifras[], hoy: string): Map<string, number> {
  const porPlan = new Map<string, Set<string>>();
  for (const s of suscripciones) {
    if (!suscripcionVigente(s, hoy)) continue;
    const set = porPlan.get(s.planId) ?? new Set<string>();
    set.add(s.socioId);
    porPlan.set(s.planId, set);
  }
  return new Map([...porPlan].map(([id, set]) => [id, set.size]));
}

export interface CifrasPaquetes {
  /** Cuotas vigentes (una por suscripción). */
  cuotasActivas: number;
  /** Personas distintas con alguna cuota vigente. */
  clientasConCuota: number;
  /** Lo que las cuotas vigentes ingresan al mes, con IVA. */
  recurrenteAlMes: number;
  /** Bonos que empezaron este mes, hasta hoy. */
  bonosMes: number;
  /** Los que llevaba el mes pasado a estas alturas (mismo día). */
  bonosMesAnteriorAlDia: number;
  /** «septiembre». */
  mesAnterior: string;
  /** Personas distintas con alguna tarifa vigente (cuota, bono o clase suelta). */
  clientasConPlan: number;
  /** Tarifas a la venta. */
  aLaVenta: number;
  /** Con precio y retiradas de la venta. */
  sinVender: number;
  /** Sin precio y sin poner a la venta (lo que deja el asistente de alta). */
  borradores: number;
  total: number;
}

export function cifrasPaquetes(p: {
  planes: readonly PlanParaCifras[];
  suscripciones: readonly SuscripcionParaCifras[];
  hoy: string;
}): CifrasPaquetes {
  const planes = new Map(p.planes.map(pl => [pl.id, pl]));
  const claveMes = p.hoy.slice(0, 7);
  const claveAnterior = mesAnterior(claveMes);
  const diaHoy = Number(p.hoy.slice(8, 10));
  let cuotasActivas = 0;
  let recurrente = 0;
  let bonosMes = 0;
  let bonosAnterior = 0;
  const conCuota = new Set<string>();
  const conPlan = new Set<string>();
  for (const s of p.suscripciones) {
    const plan = planes.get(s.planId);
    if (!plan) continue; // una tarifa borrada del catálogo: no se sabe de qué tipo era
    if (suscripcionVigente(s, p.hoy)) {
      conPlan.add(s.socioId);
      if (plan.tipo === 'MENSUAL') {
        cuotasActivas += 1;
        conCuota.add(s.socioId);
        recurrente += precioMensualDeCuota(plan);
      }
    }
    // Un bono vendido es el que EMPEZÓ ese mes. Uno cancelado no cuenta como
    // venta: es la salida que se usa para anular uno puesto por error.
    if (plan.tipo === 'BONO' && s.estado !== 'CANCELADA' && s.fechaInicio) {
      const dia = s.fechaInicio.slice(0, 10);
      const clave = dia.slice(0, 7);
      const n = Number(dia.slice(8, 10));
      if (clave === claveMes && n <= diaHoy) bonosMes += 1;
      else if (clave === claveAnterior && n <= diaHoy) bonosAnterior += 1;
    }
  }
  let aLaVenta = 0;
  let sinVender = 0;
  let borradores = 0;
  for (const pl of p.planes) {
    if (pl.activo) aLaVenta += 1;
    else if (pl.precio > 0) sinVender += 1;
    else borradores += 1;
  }
  return {
    cuotasActivas,
    clientasConCuota: conCuota.size,
    recurrenteAlMes: Math.round(recurrente * 100) / 100,
    bonosMes,
    bonosMesAnteriorAlDia: bonosAnterior,
    mesAnterior: MESES_LARGOS[Number(claveAnterior.slice(5, 7)) - 1],
    clientasConPlan: conPlan.size,
    aLaVenta,
    sinVender,
    borradores,
    total: p.planes.length,
  };
}

// ─── Lo que enseña cada tarjeta ──────────────────────────────────────────────

export interface PlanParaTarjeta {
  tipo: string;
  precio: number;
  sesiones: number | null;
  validezDias?: number | null;
  limiteSemanal?: number | null;
  /** Cuota combinada: tope semanal por tipo de clase (`PlanTarifa.limitePorTipo`). */
  limitePorTipo?: Record<string, number | null>;
  periodicidadMeses?: number | null;
}

export interface DatosDeTarjeta {
  /** «2 clases por semana», «10 sesiones», «1 sesión». */
  sesiones: string;
  /** «Se renueva cada mes», «Caduca a los 60 días», «Sin caducidad». */
  caducidad: string;
  /** Precio por sesión de un bono de varias, o `null`. */
  porSesion: number | null;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function datosDeTarjeta(plan: PlanParaTarjeta): DatosDeTarjeta {
  const tope = plan.limiteSemanal && plan.limiteSemanal > 0 ? plan.limiteSemanal : null;
  if (plan.tipo === 'MENSUAL') {
    // Sin tope total puede tenerlo por tipo («2 de Máquina + 1 de Gyrotonic»): entonces no es «sin límite».
    const porTipo = Object.values(plan.limitePorTipo ?? {}).some(v => v != null && v > 0);
    return {
      sesiones: tope ? `${plural(tope, 'clase', 'clases')} por semana` : porTipo ? 'Con tope semanal por tipo de clase' : 'Clases sin límite',
      caducidad: `Se renueva cada ${nombrePeriodo(plan)}`,
      porSesion: null,
    };
  }
  const caducidad = plan.validezDias && plan.validezDias > 0 ? `Caduca a los ${plan.validezDias} días` : 'Sin caducidad';
  if (plan.tipo === 'PUNTUAL') return { sesiones: '1 sesión', caducidad, porSesion: null };
  const n = plan.sesiones && plan.sesiones > 0 ? plan.sesiones : null;
  return {
    sesiones: n ? plural(n, 'sesión', 'sesiones') + (tope ? `, ${tope} por semana` : '') : 'Sin sesiones puestas',
    caducidad,
    porSesion: n && n > 1 && plan.precio > 0 ? Math.round((plan.precio / n) * 100) / 100 : null,
  };
}

const ENTERO = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const CON_CENTIMOS = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** «55 €» si es redondo; «55,50 €» si lleva céntimos: en un precio, los céntimos no se redondean. */
export function precioCorto(n: number): string {
  return `${Number.isInteger(n) ? ENTERO.format(n) : CON_CENTIMOS.format(n)} €`;
}

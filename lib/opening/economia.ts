// «¿Cuánto necesito aguantar?» — el simulador económico de Opening OS.
//
// Aritmética sobre datos REALES del estudio (precios de sus planes, su IVA, las
// tarifas de su equipo y el horario que ha publicado) más dos cifras que solo
// sabe ella: los gastos fijos del mes y el colchón. Lo que no se puede saber sin
// inventar —a qué ritmo va a captar socias— NO se supone: se da la pregunta al
// revés («necesitas sumar X cuotas al mes»). Por eso nunca sale una fecha de
// equilibrio. Cada cifra va con de dónde sale.

/** 52 semanas / 12 meses: misma convención que «Horas del mes» y la liquidación. */
export const SEMANAS_MES = 52 / 12;

export interface PlanEconomia {
  id: string;
  nombre: string;
  tipo: 'MENSUAL' | 'BONO' | 'PUNTUAL';
  /** IVA incluido, como se cobra. */
  precio: number;
  /** Cada cuántos meses se cobra un MENSUAL; null = cada mes. */
  periodicidadMeses: number | null;
  limiteSemanal: number | null;
  activo: boolean;
}

export interface InstructoraEconomia {
  id: string;
  tarifaHora: number | null;
  baseMensual: number | null;
  relacion: 'CONTRATADA' | 'AUTONOMA' | null;
  horasSemanalesContrato: number | null;
  /** Horas por semana que da en el horario publicado (media de la ventana). */
  horasSemanaHorario: number;
}

export interface EntradaEconomia {
  planes: PlanEconomia[];
  ivaPct: number;
  /** planId de cada cuota ACTIVA (una entrada por cuota). */
  cuotasActivas: string[];
  /** Plazas publicadas por semana (media de la ventana del análisis). */
  plazasSemana: number;
  instructoras: InstructoraEconomia[];
  /** Supuesto del estudio para un plan sin tope semanal (opening_config). */
  sesionesSemanaSinTope: number;
  /** Lo que pide: null = aún no lo ha dicho. */
  fijosMes: number | null;
  colchon: number | null;
}

export interface FilaEquilibrio {
  /** planId, o 'MEZCLA' para la mezcla real de lo vendido. */
  id: string;
  etiqueta: string;
  /** Lo que deja una cuota al mes, sin IVA. */
  netoCuotaMes: number;
  /** Cuotas para cubrir fijos + equipo, si todas fueran de esta fila. */
  cuotasEquilibrio: number;
  /** Plazas al mes que ocupan esas cuotas y capacidad del horario publicado. */
  plazasNecesarias: number;
  plazasMes: number;
  /** null sin horario publicado. > 1 = con este horario no se llega. */
  ocupacion: number | null;
  /** Cuotas nuevas al mes para llegar antes de gastar el colchón; null si no aplica. */
  ritmoMinimoMes: number | null;
}

export interface ResultadoEconomia {
  faltan: ('fijos' | 'colchon')[];
  costeEquipoMes: number;
  /** Instructoras con clases publicadas y sin tarifa: su coste NO está contado. */
  instructorasSinTarifa: number;
  /** Hay contratadas: su coste de empresa (Seguridad Social) no está contado. */
  hayContratadas: boolean;
  ingresoActualMes: number;
  cuotasMensualesVendidas: number;
  /** Fijos + equipo − lo que ya entra; ≤ 0 = ya se cubren gastos. null sin fijos. */
  deficitMes: number | null;
  /** Meses que aguanta el colchón sin vender una cuota más; null si no hay déficit o faltan datos. */
  mesesColchon: number | null;
  filas: FilaEquilibrio[];
  /** Bonos y clases sueltas no dan un ingreso mensual por sí solos: no entran. */
  planesNoMensuales: number;
}

/** Con menos, la «mezcla real» sería el precio de dos o tres personas: no se enseña. */
export const MUESTRA_MEZCLA = 5;

const netoMes = (p: PlanEconomia, ivaPct: number) =>
  p.precio / (1 + ivaPct / 100) / Math.max(1, p.periodicidadMeses ?? 1);

function costeInstructora(i: InstructoraEconomia): number | null {
  const horasMes = i.relacion === 'CONTRATADA' && i.horasSemanalesContrato != null
    ? i.horasSemanalesContrato * SEMANAS_MES
    : i.horasSemanaHorario * SEMANAS_MES;
  if (i.tarifaHora == null && i.baseMensual == null) return horasMes > 0 ? null : 0;
  return (i.tarifaHora ?? 0) * horasMes + (i.baseMensual ?? 0);
}

/**
 * Cuotas nuevas al mes, a ritmo constante, para cubrir gastos antes de gastar
 * el colchón: con déficit D, cuota p y ritmo r, se llega en D/(r·p) meses y por
 * el camino se pierde D²/(2·r·p). Que eso quepa en el colchón C da r ≥ D²/(2·p·C).
 */
export function ritmoMinimo(deficit: number, netoCuota: number, colchon: number): number | null {
  if (!(deficit > 0) || !(netoCuota > 0) || !(colchon > 0)) return null;
  return Math.ceil((deficit * deficit) / (2 * netoCuota * colchon));
}

export function simularEconomia(e: EntradaEconomia): ResultadoEconomia {
  const faltan: ResultadoEconomia['faltan'] = [];
  if (e.fijosMes == null) faltan.push('fijos');
  if (e.colchon == null) faltan.push('colchon');

  let costeEquipoMes = 0;
  let instructorasSinTarifa = 0;
  for (const i of e.instructoras) {
    const c = costeInstructora(i);
    if (c === null) instructorasSinTarifa++;
    else costeEquipoMes += c;
  }
  const hayContratadas = e.instructoras.some(i => i.relacion === 'CONTRATADA');

  const planPorId = new Map(e.planes.map(p => [p.id, p]));
  const vendidasMensuales = e.cuotasActivas.map(id => planPorId.get(id)).filter((p): p is PlanEconomia => p?.tipo === 'MENSUAL');
  const ingresoActualMes = vendidasMensuales.reduce((s, p) => s + netoMes(p, e.ivaPct), 0);

  const deficitMes = e.fijosMes == null ? null : e.fijosMes + costeEquipoMes - ingresoActualMes;
  const mesesColchon = deficitMes !== null && deficitMes > 0 && e.colchon != null ? e.colchon / deficitMes : null;

  const plazasMes = e.plazasSemana * SEMANAS_MES;
  const plazasCuotaMes = (p: Pick<PlanEconomia, 'limiteSemanal'>) => (p.limiteSemanal ?? e.sesionesSemanaSinTope) * SEMANAS_MES;
  const gastos = e.fijosMes == null ? null : e.fijosMes + costeEquipoMes;

  const fila = (id: string, etiqueta: string, neto: number, plazasPorCuota: number): FilaEquilibrio | null => {
    if (gastos === null || !(neto > 0)) return null;
    const cuotasEquilibrio = Math.ceil(gastos / neto);
    const plazasNecesarias = cuotasEquilibrio * plazasPorCuota;
    return {
      id, etiqueta, netoCuotaMes: neto, cuotasEquilibrio,
      plazasNecesarias, plazasMes,
      ocupacion: plazasMes > 0 ? plazasNecesarias / plazasMes : null,
      ritmoMinimoMes: deficitMes !== null && e.colchon != null ? ritmoMinimo(deficitMes, neto, e.colchon) : null,
    };
  };

  const mensuales = e.planes.filter(p => p.activo && p.tipo === 'MENSUAL' && p.precio > 0);
  const filas = mensuales
    .map(p => fila(p.id, p.nombre, netoMes(p, e.ivaPct), plazasCuotaMes(p)))
    .filter((f): f is FilaEquilibrio => f !== null)
    .sort((a, b) => a.cuotasEquilibrio - b.cuotasEquilibrio);

  if (vendidasMensuales.length >= MUESTRA_MEZCLA) {
    const n = vendidasMensuales.length;
    const mezcla = fila('MEZCLA', `Con tu mezcla actual (${n} cuotas)`,
      ingresoActualMes / n,
      vendidasMensuales.reduce((s, p) => s + plazasCuotaMes(p), 0) / n);
    if (mezcla) filas.unshift(mezcla);
  }

  return {
    faltan, costeEquipoMes, instructorasSinTarifa, hayContratadas,
    ingresoActualMes, cuotasMensualesVendidas: vendidasMensuales.length,
    deficitMes, mesesColchon, filas,
    planesNoMensuales: e.planes.filter(p => p.activo && p.tipo !== 'MENSUAL').length,
  };
}

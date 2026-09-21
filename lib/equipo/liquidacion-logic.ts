// Fila 11 del informe estratégico: "La nómina de instructoras genera
// conflictos" → liquidación desglosada y transparente (base + variable por
// clase + variable de sustituciones + reparto de penalizaciones). Núcleo
// puro: recibe datos ya filtrados por periodo/instructora (la capa de datos
// hace las queries), nunca llama a Date.now() ni toca red/DB — mismo patrón
// que lib/decision/margen-clase.ts.
import { hoyEnEstudio } from '../utils.ts';
import { equivalenteMensual } from './horas-contrato.ts';

const MS_HORA = 3600000;
const redondear2 = (n: number) => Math.round(n * 100) / 100;

export interface SesionParaLiquidacion {
  id: string;
  inicio: string; // ISO
  fin: string; // ISO
  /**
   * Lo que se sabe de si la dio (clases impartidas). Sin él, se paga su horario
   * como siempre: clases anteriores a la función, o aún por llegar.
   *   · DADA: se paga (su horario, o la duración real si el estudio lo elige).
   *   · NO_DADA: ella dijo que no la dio; no se paga.
   *   · SIN_CONFIRMAR: se paga su horario, pero no deja confirmar la liquidación.
   */
  control?: 'DADA' | 'NO_DADA' | 'SIN_CONFIRMAR';
  /** Solo DADA: minutos entre que empezó de verdad y su fin efectivo. */
  minutosReales?: number | null;
  /** Solo DADA: minutos que empezó tarde. Se enseñan; solo se descuentan con `pagarDuracionReal`. */
  retrasoMin?: number;
}

export interface TarifaParaLiquidacion {
  tarifaHora: number | null;
  baseMensualEur: number | null;
  recargoSustitucionPct: number | null;
}

export type LineaDetalleLiquidacion =
  | { tipo: 'propia' | 'sustitucion'; sesionId: string; horas: number; importe: number; sinTarifa: boolean; noDada?: boolean; sinConfirmar?: boolean }
  | { tipo: 'fichado'; horas: number; importe: number; sinTarifa: boolean }
  | { tipo: 'penalizaciones'; totalCobrado: number; repartidoEur: number };

/**
 * Con qué se calcula la parte variable. 'CLASES' (por defecto): horas de clase ×
 * tarifa, con recargo en las sustituciones. 'HORAS_FICHADAS': horas de jornadas
 * cerradas × tarifa; sin recargo, porque las clases que cubrió ya están dentro de
 * lo que fichó.
 */
export type ModoLiquidacion = 'CLASES' | 'HORAS_FICHADAS';

/** Relación de la instructora con el estudio (`instructor_tarifas.relacion_laboral`). */
export type RelacionLaboral = 'CONTRATADA' | 'AUTONOMA' | null;

export interface LiquidacionCalculada {
  modo: ModoLiquidacion;
  baseEur: number;
  nClasesPropias: number;
  variablePropiasEur: number;
  nClasesSustitucion: number;
  variableSustitucionEur: number;
  nPenalizaciones: number;
  repartoPenalizacionesEur: number;
  nClasesSinTarifa: number;
  /** Solo en 'HORAS_FICHADAS': minutos de jornadas cerradas del mes. */
  minutosFichados: number | null;
  /** Jornadas del mes abiertas o por revisar: no se pagan, y no se confirma con ellas. */
  jornadasSinCerrar: number;
  relacion: RelacionLaboral;
  /** Clases que terminaron sin saberse si las dio: se pagan, pero no se confirma con ellas. */
  clasesSinConfirmar: number;
  /** Clases que ella dijo que no dio: no se pagan (tampoco cuentan en nClases*). */
  clasesNoDadas: number;
  /** Suma de lo que empezó tarde en las clases dadas. */
  minutosRetraso: number;
  /** Contratada con horas de contrato: las del mes, y lo fichado por encima. Si no, null. */
  minutosContrato: number | null;
  minutosExtra: number | null;
  totalEur: number;
  detalle: LineaDetalleLiquidacion[];
}

function horasDeSesion(s: SesionParaLiquidacion, pagarDuracionReal: boolean): number {
  if (pagarDuracionReal && s.control === 'DADA' && s.minutosReales != null) return Math.max(0, s.minutosReales) / 60;
  return (new Date(s.fin).getTime() - new Date(s.inicio).getTime()) / MS_HORA;
}

/**
 * Las horas de contrato de un mes, en minutos. Misma convención de nómina que
 * «Horas del mes» (`equivalenteMensual`: 52 semanas entre 12 meses), para que las
 * dos pantallas digan la misma cifra; no mira festivos ni vacaciones.
 */
export function minutosContratoMes(horasSemanales: number | null): number | null {
  if (horasSemanales == null || !Number.isFinite(horasSemanales) || horasSemanales < 0) return null;
  return Math.round(equivalenteMensual(horasSemanales) * 60);
}

/**
 * Calcula la liquidación de una instructora para un periodo ya resuelto por
 * el llamador (mes calendario completo, sin prorrateo). `sesionesPropias` y
 * `sesionesSustitucion` deben venir YA filtradas (instructor_id/sustituta
 * correcta, no canceladas, dentro del periodo) — este módulo no conoce el
 * concepto de "periodo", solo suma lo que se le pasa.
 */
export function calcularLiquidacion(params: {
  sesionesPropias: SesionParaLiquidacion[];
  sesionesSustitucion: SesionParaLiquidacion[];
  penalizacionesCobradasEur: number[]; // importes ya filtrados por instructora y periodo
  tarifa: TarifaParaLiquidacion;
  repartoPenalizacionPct: number | null; // studios.instructor_reparto_penalizacion_pct
  modo?: ModoLiquidacion;
  /** Obligatorio en 'HORAS_FICHADAS': lo fichado en el periodo. */
  fichaje?: { minutosCerrados: number; jornadasSinCerrar: number };
  /**
   * Autónoma: no ficha jornada, así que se le paga siempre por clases, sea cual
   * sea el criterio del estudio. Contratada: con horas de contrato, lo fichado
   * por encima se enseña como extra pero no se paga aparte.
   */
  relacion?: RelacionLaboral;
  minutosContrato?: number | null;
  /** Opción del estudio: pagar lo que duró de verdad cada clase dada, no su horario. */
  pagarDuracionReal?: boolean;
}): LiquidacionCalculada {
  const { penalizacionesCobradasEur, tarifa, repartoPenalizacionPct } = params;
  const relacion = params.relacion ?? null;
  const pagarReal = params.pagarDuracionReal === true;
  const modo: ModoLiquidacion = relacion === 'AUTONOMA' ? 'CLASES' : (params.modo ?? 'CLASES');
  if (modo === 'HORAS_FICHADAS' && !params.fichaje) throw new Error('calcularLiquidacion: falta el fichaje en modo HORAS_FICHADAS');
  const todas = [...params.sesionesPropias, ...params.sesionesSustitucion];
  const clasesNoDadas = todas.filter((s) => s.control === 'NO_DADA').length;
  const clasesSinConfirmar = todas.filter((s) => s.control === 'SIN_CONFIRMAR').length;
  const minutosRetraso = todas.reduce((a, s) => a + (s.control === 'DADA' ? Math.max(0, s.retrasoMin ?? 0) : 0), 0);
  // Una clase que no dio no es una clase del mes: ni se paga ni se cuenta.
  const sesionesPropias = params.sesionesPropias.filter((s) => s.control !== 'NO_DADA');
  const sesionesSustitucion = params.sesionesSustitucion.filter((s) => s.control !== 'NO_DADA');
  const minutosContrato = relacion === 'CONTRATADA' ? (params.minutosContrato ?? null) : null;
  const minutosExtra = minutosContrato != null && params.fichaje
    ? Math.max(0, params.fichaje.minutosCerrados - minutosContrato) : null;
  const detalle: LineaDetalleLiquidacion[] = [];

  const baseEur = redondear2(tarifa.baseMensualEur ?? 0);
  const recargoFactor = 1 + (tarifa.recargoSustitucionPct ?? 0) / 100;

  let variablePropiasEur = 0;
  let nClasesSinTarifa = 0;
  let variableSustitucionEur = 0;
  if (modo === 'HORAS_FICHADAS') {
    // Contratada: las horas extra se enseñan, no se pagan aparte (decisión del 21-sep-2026).
    const horas = (params.fichaje!.minutosCerrados - (minutosExtra ?? 0)) / 60;
    const sinTarifa = tarifa.tarifaHora === null;
    const importe = sinTarifa ? 0 : redondear2(horas * (tarifa.tarifaHora as number));
    // El aviso «sin tarifa» sigue contando clases, como en el otro modo.
    if (sinTarifa) nClasesSinTarifa = sesionesPropias.length + sesionesSustitucion.length;
    variablePropiasEur = importe;
    detalle.push({ tipo: 'fichado', horas: redondear2(horas), importe, sinTarifa });
  } else {
    const marcas = (s: SesionParaLiquidacion) => (s.control === 'SIN_CONFIRMAR' ? { sinConfirmar: true } : {});
    for (const s of sesionesPropias) {
      const horas = horasDeSesion(s, pagarReal);
      const sinTarifa = tarifa.tarifaHora === null;
      const importe = sinTarifa ? 0 : redondear2(horas * (tarifa.tarifaHora as number));
      if (sinTarifa) nClasesSinTarifa++;
      variablePropiasEur += importe;
      detalle.push({ tipo: 'propia', sesionId: s.id, horas: redondear2(horas), importe, sinTarifa, ...marcas(s) });
    }

    for (const s of sesionesSustitucion) {
      const horas = horasDeSesion(s, pagarReal);
      const sinTarifa = tarifa.tarifaHora === null;
      const importe = sinTarifa ? 0 : redondear2(horas * (tarifa.tarifaHora as number) * recargoFactor);
      if (sinTarifa) nClasesSinTarifa++;
      variableSustitucionEur += importe;
      detalle.push({ tipo: 'sustitucion', sesionId: s.id, horas: redondear2(horas), importe, sinTarifa, ...marcas(s) });
    }
  }
  // Las que no dio quedan en el detalle a 0 €, para que se vea por qué faltan.
  for (const s of todas) {
    if (s.control !== 'NO_DADA') continue;
    const tipo = params.sesionesSustitucion.includes(s) ? 'sustitucion' : 'propia';
    detalle.push({ tipo, sesionId: s.id, horas: 0, importe: 0, sinTarifa: false, noDada: true });
  }

  const totalCobradoPenalizaciones = penalizacionesCobradasEur.reduce((a, b) => a + b, 0);
  const repartoPenalizacionesEur = redondear2(totalCobradoPenalizaciones * ((repartoPenalizacionPct ?? 0) / 100));
  if (penalizacionesCobradasEur.length > 0) {
    detalle.push({ tipo: 'penalizaciones', totalCobrado: redondear2(totalCobradoPenalizaciones), repartidoEur: repartoPenalizacionesEur });
  }

  variablePropiasEur = redondear2(variablePropiasEur);
  variableSustitucionEur = redondear2(variableSustitucionEur);
  const totalEur = redondear2(baseEur + variablePropiasEur + variableSustitucionEur + repartoPenalizacionesEur);

  return {
    modo,
    baseEur,
    nClasesPropias: sesionesPropias.length,
    variablePropiasEur,
    nClasesSustitucion: sesionesSustitucion.length,
    variableSustitucionEur,
    nPenalizaciones: penalizacionesCobradasEur.length,
    repartoPenalizacionesEur,
    nClasesSinTarifa,
    minutosFichados: modo === 'HORAS_FICHADAS' ? params.fichaje!.minutosCerrados : null,
    jornadasSinCerrar: modo === 'HORAS_FICHADAS' ? (params.fichaje?.jornadasSinCerrar ?? 0) : 0,
    relacion,
    clasesSinConfirmar,
    clasesNoDadas,
    minutosRetraso,
    minutosContrato,
    minutosExtra,
    totalEur,
    detalle,
  };
}

/**
 * El periodo (año/mes) de liquidación al que pertenece un instante, en hora del
 * estudio. Inverso de `rangoMesEstudio`: lo que ese rango mete en un mes, esto lo
 * devuelve a ese mismo mes. Con `getUTCMonth` una penalización cobrada a las
 * 00:30 del día 1 en Madrid se buscaba en la liquidación del mes anterior.
 */
export function periodoLiquidacionDe(instanteISO: string): { anio: number; mes: number } | null {
  const fecha = new Date(instanteISO);
  if (Number.isNaN(fecha.getTime())) return null;
  const [anio, mes] = hoyEnEstudio(fecha).split('-').map(Number);
  return { anio, mes };
}

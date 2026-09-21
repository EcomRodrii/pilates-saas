// Fila 11 del informe estratégico: "La nómina de instructoras genera
// conflictos" → liquidación desglosada y transparente (base + variable por
// clase + variable de sustituciones + reparto de penalizaciones). Núcleo
// puro: recibe datos ya filtrados por periodo/instructora (la capa de datos
// hace las queries), nunca llama a Date.now() ni toca red/DB — mismo patrón
// que lib/decision/margen-clase.ts.
import { hoyEnEstudio } from '../utils.ts';

const MS_HORA = 3600000;
const redondear2 = (n: number) => Math.round(n * 100) / 100;

export interface SesionParaLiquidacion {
  id: string;
  inicio: string; // ISO
  fin: string; // ISO
}

export interface TarifaParaLiquidacion {
  tarifaHora: number | null;
  baseMensualEur: number | null;
  recargoSustitucionPct: number | null;
}

export type LineaDetalleLiquidacion =
  | { tipo: 'propia' | 'sustitucion'; sesionId: string; horas: number; importe: number; sinTarifa: boolean }
  | { tipo: 'fichado'; horas: number; importe: number; sinTarifa: boolean }
  | { tipo: 'penalizaciones'; totalCobrado: number; repartidoEur: number };

/**
 * Con qué se calcula la parte variable. 'CLASES' (por defecto): horas de clase ×
 * tarifa, con recargo en las sustituciones. 'HORAS_FICHADAS': horas de jornadas
 * cerradas × tarifa; sin recargo, porque las clases que cubrió ya están dentro de
 * lo que fichó.
 */
export type ModoLiquidacion = 'CLASES' | 'HORAS_FICHADAS';

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
  totalEur: number;
  detalle: LineaDetalleLiquidacion[];
}

function horasDeSesion(s: SesionParaLiquidacion): number {
  return (new Date(s.fin).getTime() - new Date(s.inicio).getTime()) / MS_HORA;
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
}): LiquidacionCalculada {
  const { sesionesPropias, sesionesSustitucion, penalizacionesCobradasEur, tarifa, repartoPenalizacionPct } = params;
  const modo: ModoLiquidacion = params.modo ?? 'CLASES';
  if (modo === 'HORAS_FICHADAS' && !params.fichaje) throw new Error('calcularLiquidacion: falta el fichaje en modo HORAS_FICHADAS');
  const detalle: LineaDetalleLiquidacion[] = [];

  const baseEur = redondear2(tarifa.baseMensualEur ?? 0);
  const recargoFactor = 1 + (tarifa.recargoSustitucionPct ?? 0) / 100;

  let variablePropiasEur = 0;
  let nClasesSinTarifa = 0;
  let variableSustitucionEur = 0;
  if (modo === 'HORAS_FICHADAS') {
    const horas = params.fichaje!.minutosCerrados / 60;
    const sinTarifa = tarifa.tarifaHora === null;
    const importe = sinTarifa ? 0 : redondear2(horas * (tarifa.tarifaHora as number));
    // El aviso «sin tarifa» sigue contando clases, como en el otro modo.
    if (sinTarifa) nClasesSinTarifa = sesionesPropias.length + sesionesSustitucion.length;
    variablePropiasEur = importe;
    detalle.push({ tipo: 'fichado', horas: redondear2(horas), importe, sinTarifa });
  } else {
    for (const s of sesionesPropias) {
      const horas = horasDeSesion(s);
      const sinTarifa = tarifa.tarifaHora === null;
      const importe = sinTarifa ? 0 : redondear2(horas * (tarifa.tarifaHora as number));
      if (sinTarifa) nClasesSinTarifa++;
      variablePropiasEur += importe;
      detalle.push({ tipo: 'propia', sesionId: s.id, horas: redondear2(horas), importe, sinTarifa });
    }

    for (const s of sesionesSustitucion) {
      const horas = horasDeSesion(s);
      const sinTarifa = tarifa.tarifaHora === null;
      const importe = sinTarifa ? 0 : redondear2(horas * (tarifa.tarifaHora as number) * recargoFactor);
      if (sinTarifa) nClasesSinTarifa++;
      variableSustitucionEur += importe;
      detalle.push({ tipo: 'sustitucion', sesionId: s.id, horas: redondear2(horas), importe, sinTarifa });
    }
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
    jornadasSinCerrar: params.fichaje?.jornadasSinCerrar ?? 0,
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

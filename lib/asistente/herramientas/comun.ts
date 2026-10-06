// Piezas que comparten las herramientas: periodos, formatos y comparaciones.
// Las cifras salen YA formateadas en es-ES («1.234,50 €», «62 %») para que el
// modelo las copie tal cual y el filtro de cifras (lib/asistente/cifras.ts) las
// reconozca.

import { formatEuro } from '@/lib/utils';
import { mismoTramoAnterior, moverPeriodo, textoDeLaComparacion, tramoVisible, type Periodo, type Tramo } from '@/lib/cobros/lo-cobrado';
import type { ResultadoHerramienta } from '../tipos.ts';
import { diaLargo } from './definiciones.ts';

export const euros = (n: number) => formatEuro(n);
export const pct = (n: number | null) => (n === null ? 'sin datos' : `${n} %`);

/** «+12 %», «−3 %», «igual»; `null` si no hay con qué comparar. */
export function variacion(actual: number, anterior: number | null | undefined): string | null {
  if (anterior == null) return null;
  if (anterior === 0) return actual === 0 ? 'igual' : null;
  const v = Math.round(((actual - anterior) / anterior) * 100);
  return v === 0 ? 'igual' : `${v > 0 ? '+' : '−'}${Math.abs(v)} %`;
}

export const tono = (actual: number, anterior: number): 'sube' | 'baja' | 'igual' =>
  actual > anterior ? 'sube' : actual < anterior ? 'baja' : 'igual';

const PERIODOS: Record<'semana' | 'mes' | 'trimestre' | 'anio', Periodo> = {
  semana: 'SEMANA', mes: 'MES', trimestre: 'TRIMESTRE', anio: 'ANIO',
};

export interface TramosDelPeriodo {
  periodo: Periodo;
  visible: Tramo;
  /** El mismo tramo del periodo anterior (a medias si el visible va a medias). */
  anterior: Tramo | null;
  /** «este mes (del 1 al 5 de octubre)». */
  texto: string;
  /** «septiembre a estas alturas». */
  frente: string | null;
}

/** El periodo que se pide: el actual hasta hoy, o el anterior entero. Mismas reglas que Cobros e Informes. */
export function tramosDelPeriodo(periodo: keyof typeof PERIODOS, cual: 'actual' | 'anterior', hoy: string): TramosDelPeriodo {
  const p = PERIODOS[periodo];
  const ref = cual === 'actual' ? hoy : moverPeriodo(p, hoy, -1);
  const visible = tramoVisible(p, ref, hoy) ?? { desde: hoy, hasta: hoy };
  const nombre = {
    semana: cual === 'actual' ? 'esta semana' : 'la semana pasada',
    mes: cual === 'actual' ? 'este mes' : 'el mes pasado',
    trimestre: cual === 'actual' ? 'este trimestre' : 'el trimestre pasado',
    anio: cual === 'actual' ? 'este año' : 'el año pasado',
  }[periodo];
  return {
    periodo: p,
    visible,
    anterior: mismoTramoAnterior(p, visible),
    texto: visible.desde === visible.hasta ? `${nombre} (${diaLargo(visible.desde)})` : `${nombre} (del ${diaLargo(visible.desde)} al ${diaLargo(visible.hasta)})`,
    frente: textoDeLaComparacion(p, visible, hoy),
  };
}

/** Una respuesta de «no he podido»: va al modelo como `is_error`, sin tarjeta. */
export function fallo(mensaje: string): ResultadoHerramienta {
  return { paraModelo: { error: mensaje }, bloques: [], esError: true };
}

/** Una lectura que no ha llegado: se lanza y el registro la convierte en «no he podido leerlo». */
export class LecturaFallida extends Error {
  constructor(que: string) {
    super(`lectura fallida: ${que}`);
    this.name = 'LecturaFallida';
  }
}

export function exigir<T>(valor: T | null | undefined, que: string): T {
  if (valor === null || valor === undefined) throw new LecturaFallida(que);
  return valor;
}

/** Días enteros entre un instante y ahora. */
export const diasDesde = (iso: string, ahora: Date) => Math.floor((ahora.getTime() - new Date(iso).getTime()) / 86_400_000);

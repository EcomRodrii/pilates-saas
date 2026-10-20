// Logro «Un mes completo sin ninguna falta» (PR 3.4, Fase 3, D7/D8).
//
// Definición aprobada por el fundador, en hora del estudio:
//
//  - Se evalúa un MES NATURAL CERRADO, nunca el que está en curso.
//  - Asistencia válida = reserva `ASISTIDA` de una clase que el estudio no canceló.
//  - Falta = `NO_ASISTIO` en una clase donde se pasó lista (alguien figura
//    `ASISTIDA`) o cancelación tardía. NO son falta: cancelar a tiempo, clase
//    cancelada por el estudio (se mira PRIMERO), clase sin lista, lista de espera.
//  - Se concede con al menos `MIN_CLASES_LOGRO_MENSUAL` (2) asistencias y 0 faltas.
//  - Una `CONFIRMADA` de clase ya terminada está «por confirmar»: no cuenta ni
//    resta, pero como el logro se concede una vez en la vida, mientras quede
//    alguna el mes NO se da por evaluable (el barrido de no-shows la resolverá y
//    el barrido mensual lo reintenta al día siguiente).
//
// ⚠️ La misma definición de «asistencia válida» y «falta» vive también en
// `calcularRachaUnica` (PR 3.3, `lib/engines/streak-engine.ts`, `HechoClase`). Se
// repite aquí a propósito, puro y en fichero propio, para no tocar la racha en
// este PR: unificar las dos copias en un solo helper es el siguiente paso.
//
// Puro: sin `@/` (se prueba con `node --test --experimental-strip-types`).

import { hoyEnEstudio, inicioDelDiaEstudio, masDias } from '../utils.ts';

/** Mínimo de clases con asistencia válida para premiar el mes (D7 = 2). */
export const MIN_CLASES_LOGRO_MENSUAL = 2;

/** Días del mes (hora del estudio) en que el barrido diario evalúa el mes que acaba de cerrarse (D8). */
export const DIAS_DE_BARRIDO_MENSUAL = [1, 2] as const;

/** Una reserva de la alumna con lo que hace falta de su clase. */
export interface HechoClaseMes {
  /** Instante de inicio de la clase (ISO). */
  inicio: string;
  estado: string;
  /** `sesiones.cancelada`: la canceló el estudio. Se mira PRIMERO. */
  sesionCancelada: boolean;
  /** `reservas.cancelada_tardia`. */
  canceladaTardia?: boolean | null;
  /** En esa clase alguien figura `ASISTIDA`: se pasó lista. */
  sesionConLista: boolean;
}

export interface MesCerrado {
  /** 'YYYY-MM' */
  clave: string;
  /** Primer instante del mes (ISO, hora del estudio). Incluido. */
  desde: string;
  /** Primer instante del mes siguiente (ISO). Excluido. */
  hasta: string;
}

/** 'YYYY-MM-DD' de la fecha del estudio → su 'YYYY-MM'. */
const mesDe = (fecha: string): string => fecha.slice(0, 7);

/** ¿Hoy (en el estudio) es uno de los días en que se evalúa el mes recién cerrado? */
export function esDiaDeBarridoMensual(now: Date): boolean {
  const dia = Number(hoyEnEstudio(now).slice(8, 10));
  return (DIAS_DE_BARRIDO_MENSUAL as readonly number[]).includes(dia);
}

/** El último mes natural completo, en hora del estudio, respecto a `now`. */
export function ultimoMesCerrado(now: Date): MesCerrado {
  const hoy = hoyEnEstudio(now);
  const primeroDeEsteMes = `${mesDe(hoy)}-01`;
  const ultimoDiaAnterior = masDias(primeroDeEsteMes, -1);
  const primeroDelAnterior = `${mesDe(ultimoDiaAnterior)}-01`;
  return {
    clave: mesDe(ultimoDiaAnterior),
    desde: inicioDelDiaEstudio(primeroDelAnterior),
    hasta: inicioDelDiaEstudio(primeroDeEsteMes),
  };
}

export type MotivoMes =
  | 'cumple'
  | 'mes_en_curso'
  | 'por_confirmar'
  | 'con_faltas'
  | 'pocas_clases';

export interface ResultadoMes {
  cumple: boolean;
  motivo: MotivoMes;
  validas: number;
  faltas: number;
}

/**
 * ¿Cumple la alumna el logro en ese mes? Ignora las clases fuera del mes.
 * `now` solo sirve para negarse a evaluar un mes que aún no ha terminado.
 */
export function evaluarMesCompleto(
  clases: HechoClaseMes[],
  mes: MesCerrado,
  now: Date,
  minimoClases: number = MIN_CLASES_LOGRO_MENSUAL,
): ResultadoMes {
  if (now.getTime() < Date.parse(mes.hasta)) {
    return { cumple: false, motivo: 'mes_en_curso', validas: 0, faltas: 0 };
  }
  const desde = Date.parse(mes.desde);
  const hasta = Date.parse(mes.hasta);
  let validas = 0;
  let faltas = 0;
  let porConfirmar = false;
  for (const c of clases) {
    const t = Date.parse(c.inicio);
    if (!(t >= desde && t < hasta)) continue;
    // La clase cancelada por el estudio manda sobre cualquier estado de la reserva.
    if (c.sesionCancelada) continue;
    switch (c.estado) {
      case 'ASISTIDA': validas++; break;
      case 'CONFIRMADA': porConfirmar = true; break; // el mes cerrado ya terminó: toda clase es pasada
      case 'NO_ASISTIO': if (c.sesionConLista) faltas++; break;
      case 'CANCELADA': if (c.canceladaTardia) faltas++; break;
      default: break; // LISTA_ESPERA, PENDIENTE_APROBACION…: nunca fue su plaza
    }
  }
  if (porConfirmar) return { cumple: false, motivo: 'por_confirmar', validas, faltas };
  if (faltas > 0) return { cumple: false, motivo: 'con_faltas', validas, faltas };
  if (validas < minimoClases) return { cumple: false, motivo: 'pocas_clases', validas, faltas };
  return { cumple: true, motivo: 'cumple', validas, faltas };
}

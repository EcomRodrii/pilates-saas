// El «Calendario semanal» de /reservar (`?presentacion=semana`): días de lunes
// a domingo en columnas y horas en filas, con navegación de semana.
//
// Puro y sin React, como `rejilla-semana.ts` y `rejilla-mes.ts`: aquí vive lo
// que se puede equivocar en silencio — en qué día y en qué fila cae cada clase,
// hasta dónde se deja navegar y qué oye un lector de pantalla en cada clase.
//
// ⚠️ Todo en el día y la hora del ESTUDIO (`enEstudio`), nunca del navegador
// (RES-7-f): con la visitante en otro huso, una clase de las 00:30 del martes
// caería el lunes y la de las 10:00 en la fila de otra hora. Y las etiquetas se
// construyen a mano sobre la fecha 'YYYY-MM-DD' en vez de con `toLocale…`: el
// día ya es del estudio, y volver a pasarlo por un `Date` lo movería de nuevo
// al huso de quien mira.

import { masDias } from '../utils.ts';
import { enEstudio } from '../calendario-hora-estudio.ts';
import { estadoPlazas, haySaltoAntesDe } from './rejilla-semana.ts';

/** Lo mínimo de una clase para colocarla. Un `ReservaSlot` encaja tal cual. */
export interface ClaseSemana {
  inicio: string;
}

export interface DiaSemana {
  /** 'YYYY-MM-DD' del estudio. */
  fecha: string;
  hoy: boolean;
  /** Ya pasó: su columna se ve apagada (sus clases ya no están en la lista). */
  pasado: boolean;
}

export interface FranjaSemana<T> {
  /** Hora local del estudio (0–23) de la fila. */
  hora: number;
  /** Hay un hueco de horas antes de esta fila (p. ej. de las 10 a las 17). */
  saltoAntes: boolean;
  /** Siete celdas, de lunes a domingo, cada una con sus clases en orden. */
  celdas: T[][];
}

export interface RejillaSemana<T> {
  /** Lunes de la semana, 'YYYY-MM-DD'. */
  lunes: string;
  dias: DiaSemana[];
  /** Solo las horas con alguna clase ESA semana, ordenadas. */
  franjas: FranjaSemana<T>[];
  total: number;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** 0 = lunes … 6 = domingo, de una fecha 'YYYY-MM-DD' (sin huso de por medio). */
function diaSemanaDe(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number);
  return (new Date(Date.UTC(a, m - 1, d)).getUTCDay() + 6) % 7;
}

/**
 * El lunes de la semana de una fecha del estudio. La semana empieza en lunes,
 * como el resto del producto (`celdaDe` en rejilla-semana.ts).
 */
export function lunesDe(fecha: string): string {
  if (!FECHA.test(fecha)) return fecha;
  return masDias(fecha, -diaSemanaDe(fecha));
}

function msDe(iso: string): number {
  return new Date(iso).getTime();
}

/**
 * La rejilla de la semana que empieza en `lunes`.
 *
 * Solo tiene fila una hora con alguna clase ESA semana, igual que la rejilla
 * semanal de siempre (`franjasConClases`): un estudio que abre de 8 a 10 y de
 * 17 a 21 no quiere siete filas vacías en medio. El salto se marca
 * (`saltoAntes`) para que las 10:00 y las 17:00 no parezcan consecutivas.
 *
 * Una clase de las 10:30 va en la fila de las 10: la fila es la hora en punto,
 * y la celda la ordena detrás de la de las 10:00.
 */
export function rejillaSemana<T extends ClaseSemana>(
  clases: readonly T[],
  lunes: string,
  hoy: string,
): RejillaSemana<T> {
  const dias: DiaSemana[] = Array.from({ length: 7 }, (_, i) => {
    const fecha = masDias(lunes, i);
    return { fecha, hoy: fecha === hoy, pasado: fecha < hoy };
  });
  const indicePorFecha = new Map(dias.map((d, i) => [d.fecha, i]));

  const porHora = new Map<number, T[][]>();
  let total = 0;
  for (const c of clases) {
    const { dia, minutos } = enEstudio(c.inicio);
    const indice = indicePorFecha.get(dia); // una fecha rota da dia '' y no entra
    if (indice === undefined || Number.isNaN(minutos)) continue;
    const hora = Math.floor(minutos / 60);
    let celdas = porHora.get(hora);
    if (!celdas) {
      celdas = Array.from({ length: 7 }, () => []);
      porHora.set(hora, celdas);
    }
    celdas[indice].push(c);
    total += 1;
  }

  const horas = [...porHora.keys()].sort((a, b) => a - b);
  const franjas = horas.map((hora, i) => {
    const celdas = porHora.get(hora)!;
    // ⚠️ Por instante, no comparando las cadenas: '…T10:00:00+00:00' y
    // '…T10:00:00.000Z' son la misma hora y como texto no ordenan igual.
    for (const celda of celdas) celda.sort((a, b) => msDe(a.inicio) - msDe(b.inicio));
    return { hora, saltoAntes: haySaltoAntesDe(horas, i), celdas };
  });
  return { lunes, dias, franjas, total };
}

/** El primer día (del estudio) con clase, a partir de `desde` incluido. */
function primerDiaConClase(clases: readonly ClaseSemana[], desde: string): string | null {
  let primero: string | null = null;
  for (const c of clases) {
    const dia = enEstudio(c.inicio).dia;
    if (!dia || dia < desde) continue;
    if (primero === null || dia < primero) primero = dia;
  }
  return primero;
}

/**
 * La semana con la que abre: la de hoy, salvo que esta semana ya no quede
 * ninguna clase — entonces la de la próxima clase. Abrir en una semana vacía
 * cuando el estudio tiene clases la siguiente se lee como «no hay nada», que es
 * justo lo contrario de lo que pasa.
 */
export function semanaInicial(clases: readonly ClaseSemana[], hoy: string): string {
  const lunesHoy = lunesDe(hoy);
  const primero = primerDiaConClase(clases, hoy);
  if (!primero) return lunesHoy;
  const lunes = lunesDe(primero);
  return lunes > lunesHoy ? lunes : lunesHoy;
}

export interface NavegacionSemana {
  /** Lunes de la semana anterior, o `null` si sería una semana ya pasada. */
  anterior: string | null;
  /** Lunes de la siguiente, o `null` si después no hay ninguna clase. */
  siguiente: string | null;
  /**
   * Lunes de la próxima semana que tiene clases, para el «no hay clases esta
   * semana»: una semana vacía en medio (vacaciones) no tiene que obligar a
   * pulsar «siguiente» a ciegas hasta encontrar algo.
   */
  proximaConClases: string | null;
}

/**
 * Hasta dónde se deja navegar. Hacia atrás, nunca antes de la semana de hoy (lo
 * pasado no se puede reservar); hacia delante, mientras quede alguna clase más
 * allá — pasado ese punto solo habría semanas vacías.
 */
export function navegacionSemana(lunes: string, hoy: string, clases: readonly ClaseSemana[]): NavegacionSemana {
  const tras = masDias(lunes, 7);
  const primeroTras = primerDiaConClase(clases, tras);
  return {
    anterior: lunes > lunesDe(hoy) ? masDias(lunes, -7) : null,
    siguiente: primeroTras ? tras : null,
    proximaConClases: primeroTras ? lunesDe(primeroTras) : null,
  };
}

// ── Textos ───────────────────────────────────────────────────────────────────

const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function partes(fecha: string): { anio: number; mes: number; dia: number } {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return { anio, mes, dia };
}

/**
 * «22 – 28 de septiembre», «29 de septiembre – 5 de octubre» y, si la semana
 * cruza de año, con los dos años: «29 de diciembre de 2025 – 4 de enero de 2026».
 */
export function etiquetaRangoSemana(lunes: string): string {
  const a = partes(lunes);
  const b = partes(masDias(lunes, 6));
  if (a.anio !== b.anio) {
    return `${a.dia} de ${MESES[a.mes - 1]} de ${a.anio} – ${b.dia} de ${MESES[b.mes - 1]} de ${b.anio}`;
  }
  if (a.mes !== b.mes) return `${a.dia} de ${MESES[a.mes - 1]} – ${b.dia} de ${MESES[b.mes - 1]}`;
  return `${a.dia} – ${b.dia} de ${MESES[b.mes - 1]}`;
}

/** Cabecera de una columna: «Mié» + «12», y la versión completa para quien no la ve. */
export function cabeceraDia(fecha: string): { corta: string; numero: number; larga: string } {
  const { mes, dia } = partes(fecha);
  const i = diaSemanaDe(fecha);
  return { corta: DIAS_CORTOS[i], numero: dia, larga: `${DIAS_LARGOS[i]} ${dia} de ${MESES[mes - 1]}` };
}

/** «08:00», la etiqueta de la fila. */
export function etiquetaHora(hora: number): string {
  return `${String(hora).padStart(2, '0')}:00`;
}

/** «10:30», en hora del estudio. Cadena vacía para una fecha rota. */
export function horaDe(inicio: string): string {
  const { minutos } = enEstudio(inicio);
  if (Number.isNaN(minutos)) return '';
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
}

/** ¿Empieza a una hora en punto? Si no, el chip lo dice (la fila solo dice la hora). */
export function empiezaEnPunto(inicio: string): boolean {
  return enEstudio(inicio).minutos % 60 === 0;
}

export interface PlazasDeClase {
  aforoMaximo: number;
  ocupadas: number;
  miEstado?: 'CONFIRMADA' | 'LISTA_ESPERA' | null;
}

export type TonoPlazas = 'libre' | 'ultimas' | 'completa' | 'mia';

/**
 * Lo que dice el chip de sus plazas. Las mismas reglas que la tarjeta de la
 * lista (`TarjetaClase`): «Quedan 2» a partir de dos, «Completa» sin sitio (y
 * con un aforo sin fijar, que no es «infinitas plazas»), y lo suyo antes que
 * nada — a quien ya tiene plaza no le sirve saber cuántas quedan.
 */
export function plazasDeClase(c: PlazasDeClase): { texto: string; tono: TonoPlazas } {
  if (c.miEstado === 'CONFIRMADA') return { texto: 'Tu plaza', tono: 'mia' };
  if (c.miEstado === 'LISTA_ESPERA') return { texto: 'En espera', tono: 'mia' };
  const estado = estadoPlazas({ ocupadas: c.ocupadas, aforoMaximo: c.aforoMaximo });
  const libres = Math.max(0, c.aforoMaximo - c.ocupadas);
  if (estado === 'completa' || estado === 'lista-espera') return { texto: 'Completa', tono: 'completa' };
  if (estado === 'ultimas') return { texto: `Quedan ${libres}`, tono: 'ultimas' };
  return { texto: `${libres} libres`, tono: 'libre' };
}

/**
 * «Reformer, miércoles 12 a las 10:00, quedan 2»: el nombre del botón de cada
 * clase. En la rejilla, el día y la hora solo se deducen de la columna y la
 * fila, y un lector de pantalla que salta de botón en botón no las oye — sin
 * esto serían siete «Reformer» idénticos.
 *
 * Empieza por lo que el chip enseña (el nombre) y acaba con lo mismo que dice
 * de sus plazas, para que quien usa control por voz pueda decir lo que ve.
 */
export function nombreAccesibleClase(nombre: string, inicio: string, plazas?: string): string {
  const { dia } = enEstudio(inicio);
  if (!dia) return nombre;
  const { dia: numero } = partes(dia);
  const cuando = `${DIAS_LARGOS[diaSemanaDe(dia)]} ${numero} a las ${horaDe(inicio)}`;
  const resto = plazas ? `, ${plazas.charAt(0).toLowerCase()}${plazas.slice(1)}` : '';
  return `${nombre}, ${cuando}${resto}`;
}

/** «12 clases», el recuento de la semana. */
export function recuentoClases(n: number): string {
  return n === 1 ? '1 clase' : `${n} clases`;
}

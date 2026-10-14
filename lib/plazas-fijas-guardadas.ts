// Qué se le dice a quien asigna una o VARIAS clases fijas de una vez, con lo que
// contestó el servidor de cada una. Puro: lo prueban sus tests y lo usan las
// cuatro pantallas que abren el diálogo (ficha, Clientas, Calendario y el bloque
// «Clase fija»).
//
// Varias a la vez porque una cuota de «2 días a la semana» son dos clases fijas, y
// el diálogo solo dejaba elegir una: había que volver a entrar para la segunda.

import { fechaCortaEstudio } from './utils.ts';
import type { ResultadoGuardarPlazaFija } from './plazas-fijas-reglas.ts';

export type PlazaFijaGuardada = Extract<ResultadoGuardarPlazaFija, { ok: true }>;

/** Una clase fija guardada y la clase a la que va, dicha como en el diálogo («martes 10:00»). */
export interface ClaseFijaGuardada {
  resultado: PlazaFijaGuardada;
  clase: string;
}

/** «a», «a y b», «a, b y c». */
export function enumerar(partes: readonly string[]): string {
  if (partes.length <= 1) return partes[0] ?? '';
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

const fecha = (ymd: string) => fechaCortaEstudio(`${ymd}T12:00:00Z`);

/** Lo que ha pasado de verdad al guardar UNA, con las cifras del servidor. */
export function textoPlazaGuardada(r: PlazaFijaGuardada, movida: boolean): string {
  const partes = [movida ? 'Clase fija cambiada' : 'Clase fija guardada'];
  if (r.primeraFecha) {
    partes.push(`ya tiene reservada la clase del ${fecha(r.primeraFecha)}`);
  } else if (!r.hayClaseProgramada) {
    partes.push('en cuanto haya una clase programada en ese horario, se le reservará sola');
  } else {
    partes.push('la próxima clase no se le ha podido reservar (llena o cerrada)');
  }
  if (r.canceladas.length > 0) {
    partes.push(r.canceladas.length === 1
      ? '1 clase del horario anterior cancelada'
      : `${r.canceladas.length} clases del horario anterior canceladas`);
  }
  return partes.join(' · ');
}

/**
 * Lo mismo para todas las que se guardaron de una vez. Con una sola dice
 * exactamente lo de siempre; con varias, cuántas, qué clases tiene ya
 * reservadas y, una a una, las que todavía no.
 */
export function textoClasesFijasGuardadas(guardadas: readonly ClaseFijaGuardada[], movida: boolean): string {
  if (guardadas.length === 0) return '';
  if (guardadas.length === 1) return textoPlazaGuardada(guardadas[0].resultado, movida);

  const partes = [`${guardadas.length} clases fijas guardadas`];
  // Por fecha, no en el orden de la semana: el jueves de esta semana va antes que el martes de la siguiente.
  const reservadas = guardadas.filter(g => g.resultado.primeraFecha)
    .sort((a, b) => (a.resultado.primeraFecha as string).localeCompare(b.resultado.primeraFecha as string));
  if (reservadas.length === 1) {
    partes.push(`ya tiene reservada la clase del ${fecha(reservadas[0].resultado.primeraFecha as string)}`);
  } else if (reservadas.length > 1) {
    partes.push(`ya tiene reservadas las clases ${enumerar(reservadas.map(g => `del ${fecha(g.resultado.primeraFecha as string)}`))}`);
  }
  for (const g of guardadas) {
    if (g.resultado.primeraFecha) continue;
    partes.push(g.resultado.hayClaseProgramada
      ? `${g.clase}: la próxima clase no se le ha podido reservar (llena o cerrada)`
      : `${g.clase}: se le reservará sola en cuanto haya una clase programada en ese horario`);
  }
  const canceladas = guardadas.reduce((n, g) => n + g.resultado.canceladas.length, 0);
  if (canceladas > 0) {
    partes.push(canceladas === 1 ? '1 clase del horario anterior cancelada' : `${canceladas} clases del horario anterior canceladas`);
  }
  return partes.join(' · ');
}

/** Si una falla a mitad, las de antes YA están guardadas: se dice cuáles, para no repetirlas ni darlas por perdidas. */
export function textoYaGuardadas(clases: readonly string[]): string | null {
  if (clases.length === 0) return null;
  return clases.length === 1 ? `Ya guardada: ${clases[0]}.` : `Ya guardadas: ${enumerar(clases)}.`;
}

/**
 * Aviso ANTES de guardar cuando lo elegido pasa del límite semanal de su cuota.
 * No bloquea: el servidor vuelve a contarlo y pide confirmación (`SUPERA_LIMITE`,
 * decisión del fundador). Sin límite en la cuota (`null`/0) no hay nada que avisar.
 */
export function avisoLimiteSemanal(limite: number | null | undefined, yaTiene: number, elegidas: number): string | null {
  if (!limite || limite <= 0 || elegidas === 0) return null;
  const total = yaTiene + elegidas;
  if (total <= limite) return null;
  const cuota = `Su cuota es de ${limite} ${limite === 1 ? 'clase' : 'clases'} por semana`;
  return yaTiene > 0
    ? `${cuota}, ya tiene ${yaTiene} y con estas serían ${total}: te pediremos confirmarlo al asignar.`
    : `${cuota} y has elegido ${elegidas}: te pediremos confirmarlo al asignar.`;
}

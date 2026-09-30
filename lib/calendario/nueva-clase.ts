// «Nueva clase» del calendario: lo que el formulario calcula antes de crear.
//
// Cuatro cosas que antes vivían sueltas en la página, o que no existían:
//
//  · La hora de fin sale de la duración del tipo de clase, pero solo hasta que
//    la propietaria la toca a mano (`finConDuracion`). Antes, cambiar la hora de
//    inicio pisaba la de fin que había escrito.
//  · Las fechas de una clase que se repite (`fechasDeRepeticion`): días de la
//    semana y «hasta el…», contadas en días del ESTUDIO, nunca con `Date` del
//    navegador.
//  · Los solapes, comprobados en TODAS esas fechas (`planDeFechas`). Antes solo
//    se miraba la primera semana; si chocaba una posterior, la base de datos
//    rechazaba la serie entera y el aviso no decía qué fecha.
//  · Si la clase cae fuera del horario del estudio ese día o en un cierre
//    (`avisoHorario`, `cierreDeFecha`). Arrastrar una clase ya lo miraba; el
//    formulario, no.
//  · Qué pasa al llenarse (`fraseAlLlenarse`) y qué planes la incluyen
//    (`planesQueLaIncluyen`), con las reglas resueltas por
//    `reglasEfectivasDeTipo` — la misma resolución que «Así lo vive tu alumna».
//
// Puro: se prueba con `node --test`. Solo imports relativos con extensión.

import { detectarConflictos, type SlotSesion } from '../calendar-logic.ts';
import { diaSemanaLocal, esHoraHHMM, horaParedAInstante } from '../citas/slots.ts';
import { horaEstudio, masDias, TZ_ESTUDIO } from '../utils.ts';
import type { DiaHorario, PlanTarifa, Studio } from '../types.ts';
import type { CierreGuardado } from '../cierres/quitar-cierre.ts';
import { planCubreTipoClase } from '../bono-logic.ts';
import { reglasGuardadas, type TipoConReglas } from '../configuracion/reglas-reserva.ts';
import { reglasEfectivasDeTipo } from '../configuracion/linea-de-tiempo-reserva.ts';

/** Una clase que se repite llega, como mucho, a un año de la primera fecha. */
export const MAX_DIAS_REPETICION = 364;

const minutosDe = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmmDe = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/**
 * La hora de fin con la duración del tipo de clase. Nunca pasa al día
 * siguiente: se queda en 23:59, igual que hacía el formulario de antes.
 * `null` si la hora de inicio no es válida o el tipo no tiene duración.
 */
export function finConDuracion(horaInicio: string, minutos: number | null | undefined): string | null {
  if (!esHoraHHMM(horaInicio) || !minutos || minutos <= 0) return null;
  const total = minutosDe(horaInicio) + minutos;
  return total >= 24 * 60 ? '23:59' : hhmmDe(total);
}

/** Minutos de clase entre dos horas del mismo día. `null` si falta alguna o el fin no va después. */
export function minutosEntre(horaInicio: string, horaFin: string): number | null {
  if (!esHoraHHMM(horaInicio) || !esHoraHHMM(horaFin)) return null;
  const d = minutosDe(horaFin) - minutosDe(horaInicio);
  return d > 0 ? d : null;
}

/** «45 min», «1 h», «1 h 15 min». */
export function textoDuracion(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Las fechas ('YYYY-MM-DD') de `desde` a `hasta`, las dos incluidas, que caen
 * en alguno de `dias` (0 = domingo, como `extract(dow)`). Vacío si el rango está
 * al revés o pasa del año: el formulario lo explica, no se recorta en silencio.
 */
export function fechasDeRepeticion(desde: string, hasta: string, dias: readonly number[]): string[] {
  if (!desde || !hasta || hasta < desde || dias.length === 0) return [];
  if (hasta > masDias(desde, MAX_DIAS_REPETICION)) return [];
  const quiero = new Set(dias);
  const out: string[] = [];
  for (let f = desde; f <= hasta; f = masDias(f, 1)) {
    if (quiero.has(diaSemanaLocal(f))) out.push(f);
  }
  return out;
}

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

/** «jue 6 nov». Sin reloj ni zona: es una fecha de calendario. */
export function fechaCorta(fecha: string): string {
  const [, m, d] = fecha.split('-').map(Number);
  return `${DIAS_CORTOS[diaSemanaLocal(fecha)]} ${d} ${MESES_CORTOS[m - 1]}`;
}

/** El cierre del centro que cubre esa fecha, si hay alguno. Las fechas van en día del estudio. */
export function cierreDeFecha(fecha: string, cierres: readonly CierreGuardado[]): CierreGuardado | null {
  return cierres.find(c => c.desde <= fecha && fecha <= c.hasta) ?? null;
}

/** Inicio y fin de la clase en esa fecha, como instantes (ISO), en hora del estudio. */
export function instantesDe(fecha: string, horaInicio: string, horaFin: string): { inicio: string; fin: string } {
  return {
    inicio: horaParedAInstante(fecha, horaInicio, TZ_ESTUDIO).toISOString(),
    fin: horaParedAInstante(fecha, horaFin, TZ_ESTUDIO).toISOString(),
  };
}

export interface FechaACrear { fecha: string; inicio: string; fin: string }

export interface FechaSaltada<T extends SlotSesion = SlotSesion> extends FechaACrear {
  sala: T[];
  instructor: T[];
  /** Solo se salta por cierre cuando se pide (`saltarCierres`): la clase que se repite. */
  cierre: CierreGuardado | null;
}

/**
 * Qué fechas se pueden crear y cuáles no, y por qué.
 *
 * Se salta una fecha si la sala está ocupada o la instructora ya da clase a esa
 * hora (lo mismo que rechazan `sesiones_sala_sin_solape` y
 * `sesiones_instructor_sin_solape`: dejarla en el lote haría que la base de
 * datos rechazara TODAS). Con `saltarCierres`, también si cae en un cierre del
 * centro: es lo que ya hace `renovar_serie` al alargar una serie, y en un cierre
 * `reservar_plaza` no deja reservar a nadie.
 */
export function planDeFechas<T extends SlotSesion>(p: {
  fechas: readonly string[];
  horaInicio: string;
  horaFin: string;
  salaId: string;
  instructorId: string;
  existentes: readonly T[];
  cierres?: readonly CierreGuardado[];
  saltarCierres?: boolean;
}): { crear: FechaACrear[]; saltadas: FechaSaltada<T>[] } {
  const crear: FechaACrear[] = [];
  const saltadas: FechaSaltada<T>[] = [];
  if (minutosEntre(p.horaInicio, p.horaFin) == null) return { crear, saltadas };
  // Solo las que pueden chocar: con cientos de fechas y miles de clases, mirar
  // cada par sería lento en cada tecla.
  const candidatas = p.existentes.filter(s => !s.cancelada
    && ((p.salaId && s.salaId === p.salaId) || (p.instructorId && s.instructorId === p.instructorId)));
  for (const fecha of p.fechas) {
    const { inicio, fin } = instantesDe(fecha, p.horaInicio, p.horaFin);
    const c = detectarConflictos({ salaId: p.salaId || null, instructorId: p.instructorId || null, inicio, fin }, candidatas);
    const cierre = p.saltarCierres ? cierreDeFecha(fecha, p.cierres ?? []) : null;
    if (c.sala.length > 0 || c.instructor.length > 0 || cierre) {
      saltadas.push({ fecha, inicio, fin, sala: c.sala as T[], instructor: c.instructor as T[], cierre });
    } else {
      crear.push({ fecha, inicio, fin });
    }
  }
  return { crear, saltadas };
}

export interface Nombres<T> {
  sala: (id: string) => string;
  instructora: (id: string) => string;
  /** El nombre de la clase que ocupa ese hueco, si se sabe. */
  clase: (s: T) => string | null | undefined;
}

const tramo = (s: SlotSesion) => `${horaEstudio(s.inicio)}–${horaEstudio(s.fin)}`;

/**
 * Por qué no se crea esa fecha, en una línea:
 * «jue 6 nov · Sala Reformer ocupada 09:00–10:00 (Reformer Avanzado)».
 */
export function motivoSalto<T extends SlotSesion>(s: FechaSaltada<T>, n: Nombres<T>): string {
  const partes: string[] = [];
  if (s.cierre) partes.push(`el centro está cerrado${s.cierre.motivo ? ` (${s.cierre.motivo})` : ''}`);
  const primeraSala = s.sala[0];
  if (primeraSala) {
    const clase = n.clase(primeraSala);
    partes.push(`${n.sala(primeraSala.salaId ?? '')} ocupada ${tramo(primeraSala)}${clase ? ` (${clase})` : ''}`);
  }
  // Si la misma clase ocupa la sala y a la instructora, basta con decirlo una vez.
  const primeraInstructora = s.instructor.find(x => x.id !== primeraSala?.id);
  if (primeraInstructora) {
    const clase = n.clase(primeraInstructora);
    partes.push(`${n.instructora(primeraInstructora.instructorId ?? '')} ya da clase ${tramo(primeraInstructora)}${clase ? ` (${clase})` : ''}`);
  }
  return `${fechaCorta(s.fecha)} · ${partes.join(' · ')}`;
}

/** El título del aviso de fechas que se saltan. */
export function tituloSaltos(saltadas: readonly FechaSaltada[]): string {
  const n = saltadas.length;
  const porCierre = saltadas.filter(s => s.cierre && s.sala.length === 0 && s.instructor.length === 0).length;
  if (porCierre === n) return n === 1 ? '1 fecha cae en un cierre del centro' : `${n} fechas caen en un cierre del centro`;
  if (porCierre === 0) return n === 1 ? '1 fecha choca con otra clase' : `${n} fechas chocan con otra clase`;
  return `${n} fechas no se pueden crear`;
}

// ── Horario del estudio ─────────────────────────────────────────────────────

const DIAS_PLURAL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];

export interface HorarioDelEstudio {
  /** Por día (`studio_horario`); vacío o ausente = no se ha cargado. */
  semana?: readonly DiaHorario[];
  /** El horario único de antes, que sigue siendo el respaldo si no hay filas. */
  apertura?: string | null;
  cierre?: string | null;
}

/**
 * Si una clase de `horaInicio` a `horaFin` cae fuera del horario del estudio
 * ese día de la semana, la frase que lo dice; `null` si está dentro o no se
 * sabe. Avisa, no impide: hay estudios que dan una clase temprana a propósito.
 */
export function avisoHorario(dow: number, horaInicio: string, horaFin: string, h: HorarioDelEstudio): string | null {
  if (!esHoraHHMM(horaInicio) || !esHoraHHMM(horaFin)) return null;
  const dia = h.semana && h.semana.length > 0 ? h.semana.find(d => d.diaSemana === dow) : undefined;
  const nombre = DIAS_PLURAL[dow] ?? '';
  if (dia && !dia.abierto) return `Los ${nombre} tu estudio está cerrado.`;
  const abre = (dia ? dia.horaApertura : h.apertura)?.slice(0, 5);
  const cierra = (dia ? dia.horaCierre : h.cierre)?.slice(0, 5);
  if (!abre || !cierra || !esHoraHHMM(abre) || !esHoraHHMM(cierra)) return null;
  const antes = horaInicio < abre;
  const despues = horaFin > cierra;
  if (antes && despues) return `Los ${nombre} tu estudio abre de ${abre} a ${cierra}.`;
  if (antes) return `Tu estudio abre a las ${abre} los ${nombre}.`;
  if (despues) return `Tu estudio cierra a las ${cierra} los ${nombre}.`;
  return null;
}

// ── Reglas de reserva de ESTE tipo de clase ─────────────────────────────────

const duracionCorta = (minutos: number) => (minutos >= 60 && minutos % 60 === 0 ? `${minutos / 60} h` : `${minutos} min`);

/**
 * Qué pasa cuando la clase se llena: la frase de debajo de las plazas, que antes
 * decía «entran en lista de espera; no se bloquean» también donde no la hay. La
 * regla se resuelve como al reservar (`reglasEfectivasDeTipo`), y si no hay lista
 * de espera dice quién lo decide, para que se sepa dónde cambiarlo.
 */
export function fraseAlLlenarse(studio: Partial<Studio> | null | undefined, tipo: TipoConReglas | null | undefined): string {
  const r = reglasEfectivasDeTipo(reglasGuardadas(studio), tipo);
  if (!r.permiteListaEspera) {
    const quien = tipo && tipo.permiteListaEspera != null ? `«${tipo.nombre}» no tiene` : 'tu estudio no tiene';
    return `Al llenarse, tus alumnas ya no pueden reservarla: ${quien} lista de espera.`;
  }
  const plazo = r.listaEsperaPlazoAceptacionMinutos > 0 ? r.listaEsperaPlazoAceptacionMinutos : 0;
  return plazo > 0
    ? `Al llenarse, las siguientes entran en lista de espera; si se libera una plaza, la primera tiene ${duracionCorta(plazo)} para aceptarla.`
    : 'Al llenarse, las siguientes entran en lista de espera y la plaza que se libere pasa al momento a la primera.';
}

/** Los planes a la venta que incluyen ese tipo de clase (`planCubreTipoClase`), por nombre. */
export function planesQueLaIncluyen(
  planes: readonly Pick<PlanTarifa, 'nombre' | 'activo' | 'tiposClaseIds'>[],
  tipoClaseId: string | null | undefined,
): string[] {
  return planes.filter(p => p.activo && planCubreTipoClase(p as PlanTarifa, tipoClaseId)).map(p => p.nombre);
}

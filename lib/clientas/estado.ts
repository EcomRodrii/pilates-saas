// El ESTADO de una clienta: uno solo, calculado con sus datos, igual en todas
// las pantallas.
//
// Hasta ahora «activa» significaba seis cosas según dónde se mirase (la tarjeta
// de la lista, el KPI del resumen, la etiqueta de cada fila, la ficha, la etapa
// que se elegía a mano y la audiencia de campañas), y «con bono» cinco. Una misma
// clienta salía «De alta» en su ficha, «Activa (convertida)» en su etapa y «Sin
// datos» en la lista. Esta función es la única respuesta, y quien enseñe un
// estado o un recuento la llama a ella: el número de un filtro, las filas que
// enseña y la cifra del resumen salen de aquí.
//
// Sale de HECHOS (sus planes, sus fechas, sus clases), nunca de un campo que
// alguien tenga que acordarse de actualizar: `lead_stage` solo lo escribía un
// selector manual y por eso nunca reflejaba nada.
//
// El orden importa, y es este:
//   1. De baja     — `activo = false`. Lo único manual: una baja explícita.
//   2. Pausada     — una cuota congelada, si no tiene otro plan que la deje reservar.
//   3. De prueba   — su clase de prueba (plan `es_prueba`) es futura o de hace
//                    30 días o menos, y no ha comprado nada de verdad.
//   4. Activa      — puede reservar con un plan de verdad (la misma regla que
//                    decide si reserva: `tieneEntitlementActivo`, mirando TODAS
//                    sus suscripciones), o ha venido en los últimos 30 días.
//                    «Nueva» si su primera compra fue hace 30 días o menos (y
//                    no venía a clases desde mucho antes ni viene importada).
//   5. Inactiva    — hizo la prueba hace más de 30 días y no compró.
//   6. Sin renovar — sin derecho a reservar, y su última actividad (última
//                    clase, última compra, o el fin de su último plan si ya
//                    pasó) fue hace 60 días o menos: cuando se la puede recuperar.
//   7. Inactiva    — llegó a comprar o a venir (o viene importada con historial),
//                    pero hace más de 60 días.
//   8. Interesada  — nunca ha venido ni comprado.
//
// Los cortes (30 y 60 días) son constantes con nombre. Se midieron en producción
// el 1-oct-2026 y no hay ni un caso de clienta que vuelva tras quedarse sin plan
// (todas renuevan antes de que acabe el anterior): no hay datos para calibrarlos
// todavía, así que se quedan en 30/60 hasta que los haya.
//
// Los días se cuentan en el calendario del estudio (Madrid), no en milisegundos
// UTC: una clase a las 23:30 cuenta en su día.
//
// Puro: se prueba con `node --test`.

import type { PlanTarifa, Reserva, Sesion, Socio, Suscripcion } from '../types.ts';
import { tieneEntitlementActivo } from '../bono-logic.ts';
import { hoyEnEstudio } from '../utils.ts';

export type EstadoClienta = 'DE_BAJA' | 'PAUSADA' | 'DE_PRUEBA' | 'ACTIVA' | 'SIN_RENOVAR' | 'INACTIVA' | 'INTERESADA';

/** El orden en que se enseñan (filtros, recuentos). */
export const ESTADOS_CLIENTA: readonly EstadoClienta[] = ['ACTIVA', 'DE_PRUEBA', 'SIN_RENOVAR', 'PAUSADA', 'INACTIVA', 'DE_BAJA', 'INTERESADA'];

/** Días desde la clase de prueba en los que sigue «De prueba». */
export const DIAS_VENTANA_PRUEBA = 30;
/** Haber venido en estos días cuenta como activa aunque no tenga plan (clases sueltas). */
export const DIAS_VINO_HACE_POCO = 30;
/** «Nueva»: su primera compra de verdad fue en estos días. */
export const DIAS_NUEVA = 30;
/** Sin derecho a reservar pero con actividad en estos días: «Sin renovar». */
export const DIAS_SIN_RENOVAR = 60;
/** «Sin venir en 30 días»: el filtro de Clientas y la cifra de Resumen que lleva a él. */
export const DIAS_SIN_VENIR = 30;

export const ETIQUETA_ESTADO: Record<EstadoClienta, string> = {
  ACTIVA: 'Activa',
  DE_PRUEBA: 'De prueba',
  SIN_RENOVAR: 'Sin renovar',
  PAUSADA: 'Pausada',
  INACTIVA: 'Inactiva',
  DE_BAJA: 'De baja',
  INTERESADA: 'Interesada',
};

/** Una línea que dice qué significa cada estado, con las mismas reglas de arriba. */
export const DEFINICION_ESTADO: Record<EstadoClienta, string> = {
  ACTIVA: `Puede reservar ahora (cuota vigente o bono con sesiones) o ha venido en los últimos ${DIAS_VINO_HACE_POCO} días.`,
  DE_PRUEBA: 'Tiene su clase de prueba y todavía no ha comprado nada más.',
  SIN_RENOVAR: `Se le acabó el plan o el bono hace ${DIAS_SIN_RENOVAR} días o menos y no ha vuelto a comprar.`,
  PAUSADA: 'Tiene la cuota congelada. Se reanuda desde su ficha.',
  INACTIVA: `Llegó a venir o a comprar, pero hace más de ${DIAS_SIN_RENOVAR} días.`,
  DE_BAJA: 'La diste de baja. Su cuota ya no se renueva.',
  INTERESADA: 'Tiene ficha, pero nunca ha venido ni comprado.',
};

export interface HechosAsistencia {
  /** Inicio de la última clase a la que VINO (reserva ASISTIDA), ya pasada. ISO. */
  ultimaAsistencia: string | null;
  /** Inicio de su primera reserva que contó (confirmada, asistida o falta), pasada o futura. ISO. */
  primeraReserva: string | null;
}

export interface EntradaEstadoClienta extends HechosAsistencia {
  socioId: string;
  activo: boolean | null | undefined;
  /** ISO o 'YYYY-MM-DD'. */
  /** Puede faltar: la columna admite nulos (fichas importadas o muy antiguas). */
  fechaAlta: string | null | undefined;
  /** Viene importada con historial (sin sus datos aquí): no es una interesada. */
  historialPrevio: boolean;
  /** SOLO las suyas, en cualquier estado. */
  suscripciones: readonly Suscripcion[];
  planesTarifa: readonly PlanTarifa[];
}

export interface ResultadoEstado {
  estado: EstadoClienta;
  /** Desde cuándo ('YYYY-MM-DD'), si se sabe. */
  desde: string | null;
  /** Activa con su primera compra en los últimos `DIAS_NUEVA` días. */
  nueva: boolean;
  /** Puede reservar hoy con algún plan o bono (incluida su prueba): «con plan o bono». */
  derecho: boolean;
  /** Primera compra que no es de prueba ('YYYY-MM-DD'); la usa el arranque de las nuevas. */
  primeraCompraReal: string | null;
}

/**
 * 'YYYY-MM-DD' en el calendario del estudio, venga como fecha o como instante.
 * `null` si falta o no es una fecha: una ficha sin fecha de alta no puede tumbar
 * la lista ni el Resumen (formatear una fecha inválida lanza).
 */
function diaDe(fechaOIso: string | null | undefined): string | null {
  if (!fechaOIso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(fechaOIso)) return fechaOIso;
  const d = new Date(fechaOIso);
  return Number.isNaN(d.getTime()) ? null : hoyEnEstudio(d);
}

/** Días de calendario entre dos 'YYYY-MM-DD' (positivo si `desde` es anterior a `hasta`). */
export function diasEntre(desde: string, hasta: string): number {
  const ms = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
  return Math.round((ms(hasta) - ms(desde)) / 86_400_000);
}

const maxFecha = (fechas: (string | null | undefined)[]): string | null =>
  fechas.reduce<string | null>((m, f) => (f && (!m || f > m) ? f : m), null);
const minFecha = (fechas: (string | null | undefined)[]): string | null =>
  fechas.reduce<string | null>((m, f) => (f && (!m || f < m) ? f : m), null);

export function estadoClienta(e: EntradaEstadoClienta, ahora: Date): ResultadoEstado {
  const hoy = hoyEnEstudio(ahora);
  const planDe = new Map(e.planesTarifa.map(p => [p.id, p]));
  // Un plan borrado del catálogo cuenta como compra de verdad (como
  // `primeraVezConPlan`): ante la duda, no es «de prueba».
  const esPrueba = (s: Suscripcion) => planDe.get(s.planId)?.esPrueba === true;
  const reales = e.suscripciones.filter(s => !esPrueba(s));
  const pruebas = e.suscripciones.filter(esPrueba);
  const planes = e.planesTarifa as PlanTarifa[];

  const derecho = tieneEntitlementActivo(e.socioId, e.suscripciones as Suscripcion[], planes, hoy);
  const derechoReal = tieneEntitlementActivo(e.socioId, reales, planes, hoy);
  const primeraCompraReal = minFecha(reales.map(s => s.fechaInicio?.slice(0, 10)));
  const ultimaAsistencia = e.ultimaAsistencia ? diaDe(e.ultimaAsistencia) : null;
  const primeraReserva = e.primeraReserva ? diaDe(e.primeraReserva) : null;
  const vinoHacePoco = ultimaAsistencia !== null && diasEntre(ultimaAsistencia, hoy) <= DIAS_VINO_HACE_POCO;
  const base = { derecho, primeraCompraReal };

  if (e.activo === false) return { estado: 'DE_BAJA', desde: null, nueva: false, ...base };

  if (!derechoReal && e.suscripciones.some(s => s.estado === 'PAUSADA')) {
    return { estado: 'PAUSADA', desde: null, nueva: false, ...base };
  }

  // La fecha de su prueba: la de su primera clase si es posterior a cuando se le
  // dio la prueba; si no (una veterana a la que se le regala una prueba), el
  // día que se le dio.
  const inicioPrueba = minFecha(pruebas.map(s => s.fechaInicio?.slice(0, 10)));
  const fechaPrueba = inicioPrueba
    ? (primeraReserva && primeraReserva >= inicioPrueba ? primeraReserva : inicioPrueba)
    : null;
  const soloPrueba = fechaPrueba !== null && reales.length === 0;
  if (soloPrueba && (fechaPrueba > hoy || diasEntre(fechaPrueba, hoy) <= DIAS_VENTANA_PRUEBA)) {
    return { estado: 'DE_PRUEBA', desde: fechaPrueba, nueva: false, ...base };
  }

  if (derechoReal || vinoHacePoco) {
    // Nueva = acaba de empezar de verdad: su primera compra es reciente, no viene
    // importada con historial, y no venía a clases desde mucho antes (con un
    // plan de otro sistema, o antes de que el estudio usara planes). Venir a su
    // prueba unos días antes de comprar no le quita lo de nueva.
    const nueva = primeraCompraReal !== null && primeraCompraReal <= hoy
      && diasEntre(primeraCompraReal, hoy) <= DIAS_NUEVA
      && !e.historialPrevio
      && (primeraReserva === null || diasEntre(primeraReserva, primeraCompraReal) <= DIAS_VENTANA_PRUEBA);
    return { estado: 'ACTIVA', desde: minFecha([primeraCompraReal, primeraReserva]), nueva, ...base };
  }

  if (soloPrueba) return { estado: 'INACTIVA', desde: fechaPrueba, nueva: false, ...base };

  // Su última actividad: su última clase, el inicio de su última compra (una
  // cuota comprada ayer y cancelada sin venir no es «inactiva»), o el fin de su
  // último plan si ya ha pasado (un fin futuro no es actividad: un bono agotado
  // que caduca dentro de 9 meses no la deja «sin renovar» 9 meses).
  const ultimaActividad = maxFecha([
    ultimaAsistencia,
    maxFecha(reales.map(s => s.fechaInicio?.slice(0, 10))),
    maxFecha(reales.map(s => s.fechaFin?.slice(0, 10)).filter(f => f && f <= hoy)),
  ]);
  if (ultimaActividad && ultimaActividad <= hoy && diasEntre(ultimaActividad, hoy) <= DIAS_SIN_RENOVAR) {
    return { estado: 'SIN_RENOVAR', desde: ultimaActividad, nueva: false, ...base };
  }

  if (reales.length > 0 || ultimaAsistencia || e.historialPrevio) {
    return { estado: 'INACTIVA', desde: ultimaActividad, nueva: false, ...base };
  }

  return { estado: 'INTERESADA', desde: diaDe(e.fechaAlta), nueva: false, ...base };
}

const CUENTA_COMO_RESERVA = new Set(['CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO']);

/**
 * Su última clase a la que vino y su primera reserva, por clienta. La fecha es
 * la de la CLASE (no la de cuando reservó), igual que la columna «Última
 * asistencia» de la lista. Una asistida en el futuro no cuenta como venida.
 */
export function hechosDeAsistencia(
  reservas: readonly Pick<Reserva, 'socioId' | 'sesionId' | 'estado'>[],
  sesiones: readonly Pick<Sesion, 'id' | 'inicio'>[],
  ahora: Date,
): Map<string, HechosAsistencia> {
  const inicioDe = new Map(sesiones.map(s => [s.id, s.inicio]));
  const ahoraIso = ahora.toISOString();
  const hechos = new Map<string, HechosAsistencia>();
  for (const r of reservas) {
    if (!CUENTA_COMO_RESERVA.has(r.estado)) continue;
    const inicio = inicioDe.get(r.sesionId);
    if (!inicio) continue;
    const h = hechos.get(r.socioId) ?? { ultimaAsistencia: null, primeraReserva: null };
    if (!h.primeraReserva || inicio < h.primeraReserva) h.primeraReserva = inicio;
    if (r.estado === 'ASISTIDA' && inicio <= ahoraIso && (!h.ultimaAsistencia || inicio > h.ultimaAsistencia)) h.ultimaAsistencia = inicio;
    hechos.set(r.socioId, h);
  }
  return hechos;
}

/** Viene del importador con historial en otra plataforma (`lead_stage` de antes). */
export function tieneHistorialPrevio(s: Pick<Socio, 'leadStage'>): boolean {
  return s.leadStage === 'ACTIVA' || s.leadStage === 'EN_RIESGO' || s.leadStage === 'PERDIDA';
}

/** El estado de todas, agrupando una sola vez (no recorre todas las suscripciones por clienta). */
export function estadosDeClientas(
  datos: {
    socios: readonly Pick<Socio, 'id' | 'activo' | 'fechaAlta' | 'leadStage'>[];
    suscripciones: readonly Suscripcion[];
    planesTarifa: readonly PlanTarifa[];
    reservas: readonly Pick<Reserva, 'socioId' | 'sesionId' | 'estado'>[];
    sesiones: readonly Pick<Sesion, 'id' | 'inicio'>[];
  },
  ahora: Date,
  hechos: Map<string, HechosAsistencia> = hechosDeAsistencia(datos.reservas, datos.sesiones, ahora),
): Map<string, ResultadoEstado> {
  const porSocia = new Map<string, Suscripcion[]>();
  for (const s of datos.suscripciones) {
    const lista = porSocia.get(s.socioId);
    if (lista) lista.push(s); else porSocia.set(s.socioId, [s]);
  }
  const estados = new Map<string, ResultadoEstado>();
  for (const socia of datos.socios) {
    const h = hechos.get(socia.id);
    estados.set(socia.id, estadoClienta({
      socioId: socia.id,
      activo: socia.activo,
      fechaAlta: socia.fechaAlta,
      historialPrevio: tieneHistorialPrevio(socia),
      suscripciones: porSocia.get(socia.id) ?? [],
      planesTarifa: datos.planesTarifa,
      ultimaAsistencia: h?.ultimaAsistencia ?? null,
      primeraReserva: h?.primeraReserva ?? null,
    }, ahora));
  }
  return estados;
}

/**
 * ¿Lleva más de `DIAS_SIN_VENIR` días sin venir? Desde su última clase, o desde
 * su alta si nunca ha venido. Las interesadas no cuentan: nunca han venido y no
 * es su caso. Una sola regla para el filtro de Clientas y para la cifra de
 * Resumen, que enlaza a ese filtro: con dos, enseñaría un número y llevaría a otro.
 */
export function sinVenir(
  estado: ResultadoEstado | undefined,
  hechos: HechosAsistencia | undefined,
  fechaAlta: string | null | undefined,
  ahora: Date,
): boolean {
  if (estado?.estado === 'INTERESADA') return false;
  const desde = hechos?.ultimaAsistencia ?? fechaAlta ?? null;
  // Sin ninguna fecha (ni clase ni alta), como siempre: cuenta.
  if (!desde) return true;
  const ms = new Date(desde).getTime();
  return Number.isNaN(ms) ? true : ahora.getTime() - ms > DIAS_SIN_VENIR * 86_400_000;
}

/** Cuántas llevan más de `DIAS_SIN_VENIR` días sin venir (la cifra de Resumen). */
export function contarSinVenir(
  socios: readonly { id: string; fechaAlta?: string | null }[],
  estados: ReadonlyMap<string, ResultadoEstado>,
  hechos: ReadonlyMap<string, HechosAsistencia>,
  ahora: Date,
): number {
  let n = 0;
  for (const s of socios) if (sinVenir(estados.get(s.id), hechos.get(s.id), s.fechaAlta, ahora)) n++;
  return n;
}

export type ConteosEstado = Record<EstadoClienta, number> & { TOTAL: number; CON_DERECHO: number };

/** Los recuentos de los filtros y del resumen: la misma cuenta, siempre. */
export function contarPorEstado(estados: ReadonlyMap<string, ResultadoEstado>): ConteosEstado {
  const c: ConteosEstado = { ACTIVA: 0, DE_PRUEBA: 0, SIN_RENOVAR: 0, PAUSADA: 0, INACTIVA: 0, DE_BAJA: 0, INTERESADA: 0, TOTAL: 0, CON_DERECHO: 0 };
  for (const r of estados.values()) {
    c[r.estado]++;
    c.TOTAL++;
    if (r.derecho) c.CON_DERECHO++;
  }
  return c;
}

/**
 * Compatibilidad con la etapa de antes (`lead_stage`), para segmentos guardados
 * y audiencias `ETAPA:<x>`: a qué estados equivale. `EN_RIESGO` no tiene
 * equivalente —era un aviso que se ponía a mano— y se sigue leyendo de la
 * columna, que ya no se escribe.
 */
export function estadosDeEtapa(valor: string): ReadonlySet<EstadoClienta> | 'COLUMNA_LEGADA' {
  if ((ESTADOS_CLIENTA as readonly string[]).includes(valor)) return new Set([valor as EstadoClienta]);
  switch (valor) {
    case 'LEAD': return new Set<EstadoClienta>(['INTERESADA']);
    case 'PRUEBA': return new Set<EstadoClienta>(['DE_PRUEBA']);
    case 'PERDIDA': return new Set<EstadoClienta>(['INACTIVA', 'DE_BAJA']);
    default: return 'COLUMNA_LEGADA';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cómo viene cada clienta (P2.8): frecuencia, constancia, sesiones que le
// quedan, si ha comprado alguna vez y si tiene más de un plan. Lo usan los
// filtros y las columnas de la lista de Clientas. Puro: se prueba con
// `node --test`.
//
// No es un motor nuevo: la frecuencia y la constancia salen de `constancia()`
// (las barras de la ficha), y el saldo y los planes vivos son los índices que
// la lista ya calcula para su «Quedan N» y su «+N». Así ningún filtro puede
// contradecir lo que ya se ve en la fila. «Sin venir en 30 días» NO va aquí: ya
// está en «Más filtros», y así se combina con la frecuencia («venía mucho y se
// ha ido» = Alta + sin venir en 30 días).
//
// Datos que ya leen los tres roles con acceso a Clientas (propietaria, gerencia
// y recepción): nada de recibos (la gerencia no los lee), nada privado ni de
// salud.
// ─────────────────────────────────────────────────────────────────────────────

import { constancia } from './constancia.ts';

/**
 * Clases por semana a partir de las cuales la frecuencia es «alta» o «media».
 * No son 2 y 1 a propósito: una clase fija semanal que falta un festivo en 12
 * semanas da 0,92 (sería «baja») y un bono de 8 al mes gastado entero da 1,85
 * (sería «media»). Medido el 12-oct-2026 en producción (un estudio con datos,
 * todas por debajo de 1,4): sin muestra para afinar más; revisar con más estudios.
 */
export const FRECUENCIA_ALTA = 1.7;
export const FRECUENCIA_MEDIA = 0.7;
/** Semanas que se miran (las mismas barras que la ficha). */
export const SEMANAS_USO = 12;
/** «Lleva N semanas sin venir» desde cuántas (la misma frase y la misma cuenta que la ficha). */
export const SEMANAS_SIN_VENIR = 2;
/**
 * Semanas contadas que hacen falta para tener frecuencia o «viene todas las
 * semanas»: con una sola semana de datos (dos clases) alguien recién llegada
 * salía «Alta», y la de la semana pasada ya «venía siempre».
 */
export const SEMANAS_MINIMAS = 4;

export type Frecuencia = 'ALTA' | 'MEDIA' | 'BAJA';
export type Constancia = 'SIN_VENIR' | 'TODAS';
export type TramoSaldo = 'UNA_O_NINGUNA' | 'DOS_O_TRES' | 'CUATRO_O_MAS';

export interface UsoClienta {
  /** Clases por semana de media, en las semanas completas desde que empezó (y la actual si ya vino). null = no ha venido. */
  media: number | null;
  /**
   * Semanas COMPLETAS seguidas sin venir. La semana en curso no cuenta hasta que
   * acaba: un lunes a las 8:00 nadie «lleva 2 semanas sin venir» por haber
   * faltado una sola.
   */
  semanasSinVenir: number;
  /** Todas las semanas completas desde que empezó tienen al menos una clase. null = no ha venido. */
  todasLasSemanas: boolean | null;
  /** Cuántas semanas se han contado (desde la primera en que vino, o todas si ya venía antes). */
  semanasContadas: number;
}

export interface Asistencias {
  /** Inicio ISO de cada clase a la que vino, solo de las últimas semanas. */
  porSocia: Map<string, string[]>;
  /** Las que vinieron alguna vez ANTES de esas semanas: para ellas no se empieza a contar en su primera clase. */
  antes: Set<string>;
}

const MS_SEMANA = 7 * 86_400_000;

/**
 * Las clases a las que vino cada clienta (inicio ISO de la clase), solo de las
 * últimas `SEMANAS_USO + 1` semanas: lo anterior se descarta comparando texto,
 * antes de convertir ninguna fecha (son decenas de miles de reservas), y solo
 * se apunta QUIÉN vino antes.
 */
export function asistenciasRecientes(
  reservas: ReadonlyArray<{ socioId: string; sesionId: string; estado: string }>,
  inicioDeSesion: (sesionId: string) => string | undefined,
  ahora: Date,
): Asistencias {
  const corte = new Date(ahora.getTime() - (SEMANAS_USO + 1) * MS_SEMANA).toISOString();
  const porSocia = new Map<string, string[]>();
  const antes = new Set<string>();
  for (const r of reservas) {
    if (r.estado !== 'ASISTIDA') continue;
    const inicio = inicioDeSesion(r.sesionId);
    if (!inicio) continue;
    if (inicio < corte) { antes.add(r.socioId); continue; }
    const lista = porSocia.get(r.socioId);
    if (lista) lista.push(inicio);
    else porSocia.set(r.socioId, [inicio]);
  }
  return { porSocia, antes };
}

const redondear = (n: number) => Math.round(n * 10) / 10;

/**
 * Sobre las barras de la ficha (`constancia`), pero contando la semana en curso
 * solo si ya tiene clases: un lunes por la mañana nadie «baja» de frecuencia ni
 * deja de venir «todas las semanas» por una semana que acaba de empezar.
 *
 * Se empieza a contar en su primera clase de esas semanas, salvo si ya venía de
 * antes (`vinoAntes`): entonces cuentan todas. Si no, quien faltó las seis
 * primeras y vino las seis últimas salía «viene todas las semanas».
 */
export function usoDe(asistencias: readonly string[], ahora: Date, vinoAntes = false): UsoClienta {
  const c = constancia(asistencias, ahora, SEMANAS_USO);
  const actual = c.semanas[c.semanas.length - 1] ?? 0;
  const semanas = actual > 0 ? c.semanas : c.semanas.slice(0, -1);
  const semanasSinVenir = actual > 0 ? 0 : Math.max(0, c.semanasSinVenir - 1);
  // También vino antes quien tiene clases de la semana justo anterior a las que se miran.
  const enVentana = c.semanas.reduce((a, b) => a + b, 0);
  const ahoraIso = ahora.toISOString();
  const antes = vinoAntes || asistencias.filter(iso => iso <= ahoraIso).length > enVentana;
  const primera = semanas.findIndex(x => x > 0);
  const tramo = primera < 0 ? [] : antes ? semanas : semanas.slice(primera);
  if (tramo.length === 0) return { media: null, semanasSinVenir, todasLasSemanas: null, semanasContadas: 0 };
  return {
    media: redondear(tramo.reduce((a, b) => a + b, 0) / tramo.length),
    semanasSinVenir,
    todasLasSemanas: tramo.every(x => x > 0),
    semanasContadas: tramo.length,
  };
}

/**
 * Quien no ha venido en las últimas semanas que se miran no tiene frecuencia
 * (ni alta ni baja), ni quien lleva menos de `SEMANAS_MINIMAS` contadas.
 */
export function frecuenciaDe(uso: UsoClienta | undefined): Frecuencia | null {
  if (!uso || uso.media === null || uso.media <= 0 || uso.semanasContadas < SEMANAS_MINIMAS) return null;
  if (uso.media >= FRECUENCIA_ALTA) return 'ALTA';
  if (uso.media >= FRECUENCIA_MEDIA) return 'MEDIA';
  return 'BAJA';
}

/**
 * «Ha dejado de venir» exige que haya venido en las semanas que se miran (si
 * no, entrarían todas las que no han venido nunca); «todas las semanas», que
 * lleve al menos `SEMANAS_MINIMAS`. El resto, en ninguna.
 */
export function constanciaDe(uso: UsoClienta | undefined): Constancia | null {
  if (!uso || uso.media === null) return null;
  if (uso.semanasSinVenir >= SEMANAS_SIN_VENIR) return 'SIN_VENIR';
  return uso.todasLasSemanas && uso.semanasContadas >= SEMANAS_MINIMAS ? 'TODAS' : null;
}

/** El saldo es el «Quedan N» de la fila; sin saldo (cuota o bono ilimitado), ninguno. */
export function tramoSaldo(saldo: number | undefined): TramoSaldo | null {
  if (saldo === undefined) return null;
  if (saldo <= 1) return 'UNA_O_NINGUNA';
  if (saldo <= 3) return 'DOS_O_TRES';
  return 'CUATRO_O_MAS';
}

/**
 * Nunca ha comprado un plan ni un bono: ninguna suscripción que no sea de prueba
 * (en cualquier estado; un plan borrado del catálogo cuenta como compra, igual
 * que en estado.ts) y no viene importada con historial.
 */
export function nuncaCompro(
  suscripciones: ReadonlyArray<{ planId: string }>,
  esPrueba: (planId: string) => boolean,
  historialPrevio: boolean,
): boolean {
  return !historialPrevio && !suscripciones.some(s => !esPrueba(s.planId));
}

/** Más de un plan a la vez: la misma cuenta que el «+N» de la fila (cuota + bono es lo normal). */
export function variosPlanes(planesVivos: ReadonlySet<string> | undefined): boolean {
  return (planesVivos?.size ?? 0) >= 2;
}

// Una vez por módulo: construir un Intl por llamada es caro (una por fila).
const UN_DECIMAL = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/**
 * «1,4» para la columna «Clases por semana»: siempre con un decimal, para que
 * la columna se lea alineada. Con menos de `SEMANAS_MINIMAS` contadas lleva sus
 * semanas («2,0 (2 sem.)»): ningún filtro de frecuencia la incluye todavía, y
 * un «2,0» a secas contradiría a «Alta».
 */
export function textoFrecuencia(uso: UsoClienta | undefined): string {
  if (!uso || uso.media === null) return '—';
  const media = UN_DECIMAL.format(uso.media);
  return uso.semanasContadas < SEMANAS_MINIMAS ? `${media} (${uso.semanasContadas} sem.)` : media;
}

/** Con las palabras de la ficha: «lleva N semanas sin venir». */
export function textoConstancia(uso: UsoClienta | undefined): string {
  const c = constanciaDe(uso);
  if (c === null) return '—';
  return c === 'SIN_VENIR' ? `Lleva ${uso!.semanasSinVenir} semanas sin venir` : 'Todas las semanas';
}

// ── Lo que se ve en la pantalla ────────────────────────────────────────────
// Cada opción con su texto y la definición que sale debajo al elegirla (como
// los chips de estado). Las cifras salen de las constantes de arriba.

// Con el corte exacto y en la misma unidad que la columna «Clases por semana»
// (la media va redondeada a un decimal, así que «0,7 a 1,6» no deja huecos).
const corte = (n: number) => UN_DECIMAL.format(n);
const justoDebajo = (n: number) => UN_DECIMAL.format(Math.round((n - 0.1) * 10) / 10);
export const OPCIONES_FRECUENCIA: { id: Frecuencia; texto: string; nombre: string; definicion: string }[] = [
  { id: 'ALTA', texto: `Alta (${corte(FRECUENCIA_ALTA)} o más)`, nombre: 'alta', definicion: `${corte(FRECUENCIA_ALTA)} clases por semana o más.` },
  {
    id: 'MEDIA', texto: `Media (${corte(FRECUENCIA_MEDIA)} a ${justoDebajo(FRECUENCIA_ALTA)})`, nombre: 'media',
    definicion: `Entre ${corte(FRECUENCIA_MEDIA)} y ${justoDebajo(FRECUENCIA_ALTA)} clases por semana.`,
  },
  {
    id: 'BAJA', texto: `Baja (menos de ${corte(FRECUENCIA_MEDIA)})`, nombre: 'baja',
    definicion: `Menos de ${corte(FRECUENCIA_MEDIA)} clases por semana (unas 3 al mes o menos).`,
  },
];
export const DEFINICION_FRECUENCIA =
  `Media de sus últimas ${SEMANAS_USO} semanas (o desde que empezó, si es más reciente); la semana en curso cuenta si ya ha venido. Sale quien lleva al menos ${SEMANAS_MINIMAS} semanas; quien no ha venido en esas ${SEMANAS_USO}, en ninguna.`;

export const OPCIONES_CONSTANCIA: { id: Constancia; texto: string; definicion: string }[] = [
  {
    id: 'SIN_VENIR', texto: `Lleva ${SEMANAS_SIN_VENIR} semanas o más sin venir`,
    definicion: `Vino en las últimas ${SEMANAS_USO} semanas, pero no en las ${SEMANAS_SIN_VENIR} últimas semanas completas (la semana en curso no cuenta hasta que acaba). Para quien hace más que no viene, «Sin venir en 30 días» en «Más filtros».`,
  },
  {
    id: 'TODAS', texto: 'Viene todas las semanas',
    definicion: `No ha faltado ni una semana en las últimas ${SEMANAS_USO} (o desde que empezó, si es más reciente), y lleva al menos ${SEMANAS_MINIMAS}.`,
  },
];

export const OPCIONES_SALDO: { id: TramoSaldo; texto: string }[] = [
  { id: 'UNA_O_NINGUNA', texto: '1 o ninguna' },
  { id: 'DOS_O_TRES', texto: '2 o 3' },
  { id: 'CUATRO_O_MAS', texto: '4 o más' },
];
export const DEFINICION_SALDO =
  'Suma de las sesiones de sus bonos y clases sueltas vigentes, como el «Quedan» de su fila. Las cuotas y los bonos sin límite no cuentan.';

export const DEFINICION_NUNCA_COMPRO =
  'Ni cuota, ni bono, ni clase suelta. La clase de prueba no cuenta como compra. Incluye a las interesadas; no a las que llegaron importadas de otra plataforma, porque lo que compraron allí no está aquí.';
export const DEFINICION_VARIOS_PLANES =
  'Dos o más planes o bonos distintos vivos a la vez (activos o en pausa), los que su fila suma con «+1», «+2»… Una cuota con un bono también cuenta.';

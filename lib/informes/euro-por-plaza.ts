// ─────────────────────────────────────────────────────────────────────────────
// El mapa de «€ por plaza a la venta» de Informes (pieza E, 13-oct-2026).
//
// € por plaza de una franja (día de la semana × hora de inicio del estudio,
// la de verdad: 09:15, 18:30) = lo cobrado que se REPARTE entre sus plazas ÷ las
// plazas A LA VENTA.
//
// Plazas a la venta: el aforo de las clases no canceladas que empezaron en el
// periodo (el mismo filtro que «Ocupación»: `sesionesDelTramo`). Si una clase
// tuvo más plazas ocupadas que aforo (se bajó el aforo después, o aforo 0 con
// reservas), cuentan las ocupadas: si no, salían plazas libres negativas y el
// dinero de esas clases se dividía entre las plazas de las otras.
//
// Lo repartido sale de lo COBRADO de verdad, nunca de una tarifa: cada alumna
// reparte lo que pagó en el periodo por cuota, bono o clase suelta
// (`cobradoEnTramo` + `importeIngresado` + `motivoDelCobro`, como pide
// docs/cifras-financieras.md) entre las plazas que ocupó (vino, faltó o tenía
// reserva: `OCUPA_PLAZA`). «Ana pagó 180 € y vino 12 veces: cada plaza suya
// vale 15 €». Una plaza de ClassPass/USC/Wellhub o de una alumna sin cobro en el
// periodo vale 0 €, y se cuenta aparte para decirlo.
//
// El cuadre, al céntimo: Cobrado del titular = lo que no se reparte (Caja,
// sesiones privadas, otros, sin clienta) + lo de alumnas que no vinieron a
// ninguna clase + lo repartido en todas las celdas. Por eso el mapa solo se
// pinta con el periodo CERRADO: es contra ese titular contra el que cuadra.
//
// NO es el «Ingreso» de la tabla Clases (lib/decision/margen-clase.ts): ese
// estima por la tarifa de cada alumna; esto reparte lo cobrado.
//
// Puro: se prueba con `node --test` (también con `TZ=UTC`).
// ─────────────────────────────────────────────────────────────────────────────

import { importeIngresado } from '../billing/situacion-recibo.ts';
import { cobradoEnTramo, type Tramo } from '../cobros/lo-cobrado.ts';
import { franjaLocalDe } from '../utils.ts';
import { OCUPA_PLAZA, sesionesDelTramo, type ReservaParaInforme, type SesionParaInforme } from './clases.ts';
import type { ReciboDeInforme } from './dinero.ts';
import { motivoDelCobro, type MotivoCobro, type TipoDePlanDe } from './motivo-cobro.ts';

/** Con menos clases en una franja, «—»: muy pocas para fiarse de la cifra. */
export const MIN_CLASES_CELDA = 4;
/**
 * Niveles de color de la rejilla (terciles de las celdas con cifra): con cinco
 * tonos de una sola tinta no se distinguen unos de otros.
 */
export const NIVELES = 3;
/**
 * % de tinta (`--foreground`) sobre la tarjeta por nivel, de menos a más: lo usan
 * el mapa y el dibujo del explicador, para que enseñen la misma escala.
 * Tinta, como el gráfico de Informes: OPEN DECISION 22 de `brand/implementation-plan.md`.
 */
export const TINTA_POR_NIVEL = [10, 32, 62] as const;

/** Los motivos que se reparten entre plazas; el resto («Caja», «Sesiones privadas», «Otros»), no. */
const SE_REPARTE: ReadonlySet<MotivoCobro> = new Set(['CUOTA', 'BONO', 'CLASE_SUELTA']);

export interface SesionDeCelda {
  sesionId: string;
  inicio: string;
  tipoClaseId: string;
  aforo: number;
  ocupadas: number;
  /** € repartidos a esta clase (sin redondear). */
  repartido: number;
}

export interface EjemploDeCelda {
  socioId: string;
  /** Lo que pagó en el periodo (cuota, bono, clase suelta). */
  pagado: number;
  /** Sus plazas en todo el periodo. */
  plazasEnElPeriodo: number;
  /** pagado ÷ plazasEnElPeriodo. */
  valorPlaza: number;
  /** Sus plazas en esta franja. */
  plazasAqui: number;
}

export interface CeldaEuroPlaza {
  /** Día de la semana en hora del estudio (0 = domingo, como `franjaLocalDe`). */
  dow: number;
  /** Hora de inicio en hora del estudio, «18:30» (la misma unidad que la tabla Clases y Agenda). */
  inicio: string;
  nClases: number;
  /** Plazas a la venta: la suma del aforo. */
  plazas: number;
  /** Plazas ocupadas (vino, faltó o tenía reserva). */
  ocupadas: number;
  pct: number | null;
  /** € repartidos a la franja (sin redondear: se redondea al pintar). */
  repartido: number;
  /** `null` con menos de `MIN_CLASES_CELDA` clases o sin aforo. */
  euroPorPlaza: number | null;
  /** Plazas de ClassPass, USC o Wellhub: ocupan y valen 0 €. */
  externas: number;
  /** Plazas de alumnas sin cobro en el periodo (pagó antes, cortesía o le falta el recibo): 0 €. */
  sinCobro: number;
  sesiones: SesionDeCelda[];
  /** La alumna con más plazas en la franja que sí pagó en el periodo (desempate por id). */
  ejemplo: EjemploDeCelda | null;
}

export interface CuadreEuroPlaza {
  /** El «Cobrado» del titular: `cobradoEnTramo(...).neto`. */
  cobrado: number;
  caja: number;
  sesionesPrivadas: number;
  /** Matrículas, penalizaciones y cobros sin plan. */
  otros: number;
  /** Cuotas, bonos y clases sueltas sin clienta. */
  sinClienta: number;
  /** De alumnas que pagaron y no ocuparon ninguna plaza en el periodo. */
  deNoVinieron: number;
  /** Lo que se reparte entre las plazas: la suma de todas las celdas. */
  repartido: number;
}

export interface MapaEuroPlaza {
  /** Solo las franjas con alguna clase. */
  celdas: CeldaEuroPlaza[];
  /** Las horas de inicio con alguna clase, en orden («09:15», «18:30»). */
  horas: string[];
  total: { nClases: number; plazas: number; ocupadas: number; repartido: number; euroPorPlaza: number | null };
  cuadre: CuadreEuroPlaza;
  /** Cortes entre niveles de color; vacío si hay menos de `NIVELES` celdas con cifra (no se colorea). */
  cortes: number[];
}

const pctDe = (ocupadas: number, plazas: number) => (plazas > 0 ? Math.round((ocupadas / plazas) * 100) : null);

export function mapaEuroPorPlaza(
  sesiones: readonly SesionParaInforme[],
  reservas: readonly ReservaParaInforme[],
  recibos: readonly ReciboDeInforme[],
  t: Tramo,
  ahora: Date,
  tipoDePlanDe: TipoDePlanDe,
): MapaEuroPlaza {
  // ── Lo cobrado: qué se reparte y qué no ──
  const cobrado = cobradoEnTramo(recibos, t);
  const cuadre: CuadreEuroPlaza = { cobrado: cobrado.neto, caja: 0, sesionesPrivadas: 0, otros: 0, sinClienta: 0, deNoVinieron: 0, repartido: 0 };
  const pagadoPor = new Map<string, number>();
  for (const r of cobrado.recibos) {
    const n = importeIngresado(r);
    if (n <= 0) continue;
    const motivo = motivoDelCobro(r, tipoDePlanDe);
    if (motivo === 'CAJA') cuadre.caja += n;
    else if (motivo === 'SESION_PRIVADA') cuadre.sesionesPrivadas += n;
    else if (!SE_REPARTE.has(motivo)) cuadre.otros += n;
    else if (!r.socioId) cuadre.sinClienta += n;
    else pagadoPor.set(r.socioId, (pagadoPor.get(r.socioId) ?? 0) + n);
  }

  // ── Las plazas del periodo ──
  const dentro = sesionesDelTramo(sesiones, t, ahora);
  const sesionPorId = new Map(dentro.map(s => [s.id, s]));
  const ocupantes = new Map<string, (string | null)[]>(); // sesión → socioId (null = externa)
  const plazasDe = new Map<string, number>(); // alumna → plazas en el periodo
  for (const r of reservas) {
    if (!sesionPorId.has(r.sesionId) || !OCUPA_PLAZA.has(r.estado)) continue;
    const lista = ocupantes.get(r.sesionId);
    if (lista) lista.push(r.socioId); else ocupantes.set(r.sesionId, [r.socioId]);
    if (r.socioId) plazasDe.set(r.socioId, (plazasDe.get(r.socioId) ?? 0) + 1);
  }
  const valorPlazaDe = (socioId: string): number => {
    const pagado = pagadoPor.get(socioId);
    const n = plazasDe.get(socioId) ?? 0;
    return pagado && n > 0 ? pagado / n : 0;
  };
  for (const [socioId, pagado] of pagadoPor) if (!plazasDe.has(socioId)) cuadre.deNoVinieron += pagado;

  // ── Por franja ──
  interface Acumulado { celda: CeldaEuroPlaza; plazasPorSocia: Map<string, number> }
  const porFranja = new Map<string, Acumulado>();
  for (const s of dentro) {
    const { dow, hora, minuto } = franjaLocalDe(s.inicio);
    const inicio = `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
    const clave = `${dow}-${inicio}`;
    let a = porFranja.get(clave);
    if (!a) {
      a = {
        celda: { dow, inicio, nClases: 0, plazas: 0, ocupadas: 0, pct: null, repartido: 0, euroPorPlaza: null, externas: 0, sinCobro: 0, sesiones: [], ejemplo: null },
        plazasPorSocia: new Map(),
      };
      porFranja.set(clave, a);
    }
    const quienes = ocupantes.get(s.id) ?? [];
    const aforo = Math.max(0, s.aforoMaximo ?? 0, quienes.length);
    let repartido = 0;
    for (const socioId of quienes) {
      if (!socioId) { a.celda.externas++; continue; }
      const v = valorPlazaDe(socioId);
      if (v === 0) a.celda.sinCobro++;
      repartido += v;
      a.plazasPorSocia.set(socioId, (a.plazasPorSocia.get(socioId) ?? 0) + 1);
    }
    a.celda.nClases++;
    a.celda.plazas += aforo;
    a.celda.ocupadas += quienes.length;
    a.celda.repartido += repartido;
    a.celda.sesiones.push({ sesionId: s.id, inicio: s.inicio, tipoClaseId: s.tipoClaseId, aforo, ocupadas: quienes.length, repartido });
  }

  const celdas: CeldaEuroPlaza[] = [];
  let total = { nClases: 0, plazas: 0, ocupadas: 0, repartido: 0 };
  for (const { celda, plazasPorSocia } of porFranja.values()) {
    celda.pct = pctDe(celda.ocupadas, celda.plazas);
    celda.euroPorPlaza = celda.nClases >= MIN_CLASES_CELDA && celda.plazas > 0 ? celda.repartido / celda.plazas : null;
    celda.ejemplo = ejemploDe(plazasPorSocia, pagadoPor, plazasDe);
    total = {
      nClases: total.nClases + celda.nClases, plazas: total.plazas + celda.plazas,
      ocupadas: total.ocupadas + celda.ocupadas, repartido: total.repartido + celda.repartido,
    };
    celdas.push(celda);
  }
  // Lunes primero, como el calendario; dentro del día, por hora.
  celdas.sort((x, y) => ((x.dow + 6) % 7) - ((y.dow + 6) % 7) || x.inicio.localeCompare(y.inicio));
  cuadre.repartido = total.repartido;
  const horas = [...new Set(celdas.map(c => c.inicio))].sort();

  return {
    celdas,
    horas,
    total: { ...total, euroPorPlaza: total.plazas > 0 ? total.repartido / total.plazas : null },
    cuadre,
    cortes: cortesDeColor(celdas.map(c => c.euroPorPlaza).filter((v): v is number => v !== null)),
  };
}

function ejemploDe(
  plazasPorSocia: ReadonlyMap<string, number>, pagadoPor: ReadonlyMap<string, number>, plazasDe: ReadonlyMap<string, number>,
): EjemploDeCelda | null {
  let mejor: EjemploDeCelda | null = null;
  for (const [socioId, plazasAqui] of plazasPorSocia) {
    const pagado = pagadoPor.get(socioId);
    const plazasEnElPeriodo = plazasDe.get(socioId) ?? 0;
    if (!pagado || plazasEnElPeriodo === 0) continue;
    if (mejor && (plazasAqui < mejor.plazasAqui || (plazasAqui === mejor.plazasAqui && socioId > mejor.socioId))) continue;
    mejor = { socioId, pagado, plazasEnElPeriodo, valorPlaza: pagado / plazasEnElPeriodo, plazasAqui };
  }
  return mejor;
}

/**
 * Cortes por terciles (rango más cercano) de las celdas con cifra: el color es
 * RELATIVO a las otras horas del propio estudio (no hay un € por plaza «bueno»
 * en general). Con menos de `NIVELES` celdas no hay con qué comparar: sin color.
 */
export function cortesDeColor(valores: readonly number[]): number[] {
  if (valores.length < NIVELES) return [];
  const orden = [...valores].sort((a, b) => a - b);
  return Array.from({ length: NIVELES - 1 }, (_, i) => orden[Math.ceil(((i + 1) * orden.length) / NIVELES) - 1]);
}

/** 0 (menos) a `NIVELES - 1` (más); `null` sin cifra o sin cortes. */
export function nivelDeColor(valor: number | null, cortes: readonly number[]): number | null {
  if (valor === null || cortes.length === 0) return null;
  return cortes.filter(c => valor > c).length;
}

/**
 * ¿Faltan los planes? Si hay cobros con suscripción y NINGUNO se puede
 * clasificar (`tipoDePlanDe` no sabe de ninguno), la tabla de planes no ha
 * llegado: todo caería en «Otros» y el mapa saldría a 0 € en todas las casillas,
 * cuadrando igual. Se trata como datos a medias. (Uno suelto sin tipo es un plan
 * borrado, y va a «Otros» como en el resto de Informes.)
 */
export function faltanLosPlanes(recibos: readonly ReciboDeInforme[], tipoDePlanDe: TipoDePlanDe): boolean {
  let conPlan = 0;
  for (const r of recibos) {
    if (!r.suscripcionId) continue;
    conPlan++;
    if (tipoDePlanDe(r.suscripcionId)) return false;
  }
  return conPlan > 0;
}

/** El último día del mes anterior al de `hoy` ('YYYY-MM-DD'): «Ver el mes pasado». */
export function finDelMesPasado(hoy: string): string {
  const d = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1, 1, 12));
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/** El último día del trimestre natural anterior al de `hoy`: «Ver el trimestre pasado». */
export function finDelTrimestrePasado(hoy: string): string {
  const m0 = Math.floor((Number(hoy.slice(5, 7)) - 1) / 3) * 3; // 0-based, primer mes del trimestre de hoy
  const d = new Date(Date.UTC(Number(hoy.slice(0, 4)), m0, 1, 12));
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/** El periodo ya terminó (el mapa solo cuadra con un periodo cerrado). */
export function periodoCerrado(t: Tramo, hoy: string): boolean {
  return t.hasta < hoy;
}

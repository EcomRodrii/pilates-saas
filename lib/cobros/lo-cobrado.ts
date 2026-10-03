// ─────────────────────────────────────────────────────────────────────────────
// «Lo que he cobrado» (decisión 3 de las maquetas aprobadas el 2-oct-2026):
// SOLO lo cobrado, por hoy, semana o mes (y trimestre o año para la gestoría),
// frente al mismo tramo del periodo anterior, y cómo te han pagado.
//
// Las cifras salen de `situacion-recibo.ts` (`importeIngresado`): lo cobrado es
// neto de lo devuelto y cuenta en el día de su COBRO (`fecha_cobro`). Un recibo
// devuelto entero sigue en la lista de su día («devuelto»), pero suma 0.
//
// Todas las fechas son 'YYYY-MM-DD' del ESTUDIO y se operan con `Date.UTC` sobre
// esos números: nada de `new Date('YYYY-MM-DD')` en la zona del navegador.
//
// Puro: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { aCentimos, importeIngresado, situacionRecibo, type ReciboParaCifras } from '../billing/situacion-recibo.ts';
import { horaEstudio, hoyEnEstudio } from '../utils.ts';

export type Periodo = 'DIA' | 'SEMANA' | 'MES' | 'TRIMESTRE' | 'ANIO';

export interface Tramo { desde: string; hasta: string }

const partes = (ymd: string) => ({ y: Number(ymd.slice(0, 4)), m: Number(ymd.slice(5, 7)), d: Number(ymd.slice(8, 10)) });
const ymdDe = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);
const msDe = (ymd: string) => { const { y, m, d } = partes(ymd); return utc(y, m, d); };
/** Último día del mes `m` (1–12) de `y`. */
const finDeMes = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const sumarDias = (ymd: string, dias: number) => { const { y, m, d } = partes(ymd); return ymdDe(utc(y, m, d + dias)); };
export const diaDeLaSemana = (ymd: string) => { const { y, m, d } = partes(ymd); return new Date(utc(y, m, d)).getUTCDay(); };

/** El periodo entero que contiene `ref`. La semana empieza en lunes. */
export function tramo(periodo: Periodo, ref: string): Tramo {
  const { y, m } = partes(ref);
  switch (periodo) {
    case 'DIA': return { desde: ref, hasta: ref };
    case 'SEMANA': {
      const desde = sumarDias(ref, -((diaDeLaSemana(ref) + 6) % 7));
      return { desde, hasta: sumarDias(desde, 6) };
    }
    case 'MES': return { desde: ymdDe(utc(y, m, 1)), hasta: ymdDe(utc(y, m, finDeMes(y, m))) };
    case 'TRIMESTRE': {
      const m0 = Math.floor((m - 1) / 3) * 3 + 1;
      return { desde: ymdDe(utc(y, m0, 1)), hasta: ymdDe(utc(y, m0 + 2, finDeMes(y, m0 + 2))) };
    }
    case 'ANIO': return { desde: `${y}-01-01`, hasta: `${y}-12-31` };
  }
}

/** El periodo anterior (o siguiente, con `paso` 1) al que contiene `ref`: para las flechas. */
export function moverPeriodo(periodo: Periodo, ref: string, paso: -1 | 1): string {
  const t = tramo(periodo, ref);
  if (paso === 1) return sumarDias(t.hasta, 1);
  return tramo(periodo, sumarDias(t.desde, -1)).desde;
}

/**
 * Lo que se enseña de un periodo: entero si ya terminó, y hasta hoy si es el de
 * hoy. `null` si aún no ha empezado (no se navega al futuro).
 */
export function tramoVisible(periodo: Periodo, ref: string, hoy: string): Tramo | null {
  const t = tramo(periodo, ref);
  if (t.desde > hoy) return null;
  return { desde: t.desde, hasta: t.hasta < hoy ? t.hasta : hoy };
}

/**
 * El mismo tramo del periodo anterior, para comparar: del 1 al 2 de octubre
 * frente al 1 al 2 de septiembre; un mes cerrado, frente al mes anterior entero.
 * Para «Hoy» no hay comparación honesta (el día va a medias): `null`.
 */
export function mismoTramoAnterior(periodo: Periodo, visible: Tramo): Tramo | null {
  if (periodo === 'DIA') return null;
  const anterior = tramo(periodo, sumarDias(visible.desde, -1));
  const entero = tramo(periodo, visible.desde);
  if (visible.hasta === entero.hasta) return anterior;
  // A medias: en mes, trimestre y año, la misma posición de mes y día (el 31 de
  // mayo, 2.º mes del trimestre, frente al 28 de febrero; si el anterior no tiene
  // ese día —31 frente a 30, 29 de febrero—, hasta el final de su mes). En la
  // semana, los mismos días transcurridos.
  let hasta: string;
  if (periodo === 'MES' || periodo === 'TRIMESTRE' || periodo === 'ANIO') {
    const v = partes(visible.hasta), a = partes(anterior.desde);
    const mes = a.m + (v.m - partes(visible.desde).m);
    const dia = Math.min(v.d, finDeMes(a.y, mes));
    hasta = ymdDe(utc(a.y, mes, dia));
  } else {
    const transcurridos = Math.round((msDe(visible.hasta) - msDe(visible.desde)) / 86_400_000);
    hasta = sumarDias(anterior.desde, transcurridos);
  }
  return { desde: anterior.desde, hasta: hasta < anterior.hasta ? hasta : anterior.hasta };
}

/** Cómo se cobró, para cuadrar la caja y el banco. */
export type ComoSeCobro =
  | 'DOMICILIACION' | 'TARJETA_ONLINE' | 'TARJETA_MOSTRADOR' | 'EFECTIVO' | 'BIZUM' | 'TRANSFERENCIA' | 'SIN_ESPECIFICAR';

export const ORDEN_COMO_SE_COBRO: readonly ComoSeCobro[] = [
  'DOMICILIACION', 'TARJETA_ONLINE', 'TARJETA_MOSTRADOR', 'EFECTIVO', 'BIZUM', 'TRANSFERENCIA', 'SIN_ESPECIFICAR',
];

export const TEXTO_COMO_SE_COBRO: Record<ComoSeCobro, string> = {
  DOMICILIACION: 'Domiciliación',
  TARJETA_ONLINE: 'Tarjeta online',
  TARJETA_MOSTRADOR: 'Tarjeta en el mostrador',
  EFECTIVO: 'Efectivo',
  BIZUM: 'Bizum',
  TRANSFERENCIA: 'Transferencia',
  SIN_ESPECIFICAR: 'Sin especificar',
};

export interface ReciboCobrado extends ReciboParaCifras {
  id: string;
  metodoCobro?: string | null;
  stripePaymentIntentId?: string | null;
  /** Por qué canal se confirmó: 'tpv' y 'manual' son el mostrador. */
  conciliadoPor?: string | null;
}

/**
 * La tarjeta del datáfono del mostrador también deja cargo de Stripe (el cobro de
 * un recibo en la caja), así que el cargo solo no basta: manda el canal.
 */
export function comoSeCobro(r: ReciboCobrado): ComoSeCobro {
  switch (r.metodoCobro) {
    case 'SEPA': return 'DOMICILIACION';
    case 'EFECTIVO': return 'EFECTIVO';
    case 'BIZUM': return 'BIZUM';
    case 'TRANSFERENCIA': return 'TRANSFERENCIA';
    case 'TARJETA':
      if (r.conciliadoPor === 'tpv' || r.conciliadoPor === 'manual') return 'TARJETA_MOSTRADOR';
      return r.stripePaymentIntentId ? 'TARJETA_ONLINE' : 'TARJETA_MOSTRADOR';
    default: return 'SIN_ESPECIFICAR';
  }
}

export interface LoCobrado<R extends ReciboCobrado> {
  /** Neto, ya restado lo devuelto. */
  neto: number;
  /** Recibos cobrados en el tramo (también los devueltos después, que suman 0). */
  recibos: R[];
  /** Los que dejaron dinero (los devueltos enteros no): las filas del fichero de la gestoría. */
  nCobros: number;
  /** De ellos, con algo devuelto. */
  nConDevolucion: number;
  /** Neto por día ('YYYY-MM-DD'). */
  porDia: Map<string, number>;
  /** Neto y número de cobros por cómo se cobró. Suman el total. */
  porComo: Record<ComoSeCobro, { n: number; neto: number }>;
}

/** Lo cobrado entre dos días (incluidos), por la fecha de COBRO. */
export function cobradoEnTramo<R extends ReciboCobrado>(recibos: readonly R[], t: Tramo): LoCobrado<R> {
  const porComo = Object.fromEntries(ORDEN_COMO_SE_COBRO.map(k => [k, { n: 0, neto: 0 }])) as Record<ComoSeCobro, { n: number; neto: number }>;
  const porDia = new Map<string, number>();
  const dentro: R[] = [];
  let neto = 0, nConDevolucion = 0, nCobros = 0;
  for (const r of recibos) {
    const f = r.fechaCobro?.slice(0, 10);
    if (!f || f < t.desde || f > t.hasta) continue;
    const s = situacionRecibo(r);
    if (s !== 'COBRADO' && s !== 'REEMBOLSADO') continue;
    dentro.push(r);
    const n = importeIngresado(r);
    neto += n;
    if (Number(r.importeDevuelto ?? 0) > 0) nConDevolucion++;
    porDia.set(f, aCentimos((porDia.get(f) ?? 0) + n));
    // Se cuenta lo que dejó dinero: un cobro devuelto entero sigue en la lista de su
    // día, pero no es un cobro más (ni una fila del fichero de la gestoría).
    if (n <= 0) continue;
    nCobros++;
    const c = porComo[comoSeCobro(r)];
    c.n++;
    c.neto = aCentimos(c.neto + n);
  }
  return { neto: aCentimos(neto), recibos: dentro, nCobros, nConDevolucion, porDia, porComo };
}

/**
 * La hora de un cobro («12:40», en hora del estudio), solo cuando es de verdad la
 * hora del cobro: `cobradoEn` la guarda la base de datos cuando el registro
 * ocurre en el momento del pago (mostrador, TPV, tarjeta guardada, webhook), y
 * se exige además que su día en Madrid sea el de `fechaCobro`. Un cobro antiguo,
 * una domiciliación o una transferencia no la tienen: `null`, y no se inventa.
 */
export function horaDelCobro(r: { cobradoEn?: string | null; fechaCobro?: string | null }): string | null {
  if (!r.cobradoEn || !r.fechaCobro) return null;
  const instante = new Date(r.cobradoEn);
  if (Number.isNaN(instante.getTime())) return null;
  if (hoyEnEstudio(instante) !== r.fechaCobro.slice(0, 10)) return null;
  return horaEstudio(instante);
}

// ── Textos del periodo ──────────────────────────────────────────────────────

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const conAnio = (ymd: string, hoy: string) => (ymd.slice(0, 4) === hoy.slice(0, 4) ? '' : ` de ${ymd.slice(0, 4)}`);

/** «2 oct», «28 dic 2025». */
function diaMes(ymd: string, hoy: string): string {
  const { m, d } = partes(ymd);
  return `${d} ${MESES[m - 1].slice(0, 3)}${ymd.slice(0, 4) === hoy.slice(0, 4) ? '' : ` ${ymd.slice(0, 4)}`}`;
}

/** Lo que dice el selector entre las flechas: «Hoy», «Esta semana», «Octubre», «Marzo de 2025»… */
export function textoDelPeriodo(periodo: Periodo, ref: string, hoy: string): string {
  const t = tramo(periodo, ref);
  switch (periodo) {
    case 'DIA':
      if (ref === hoy) return 'Hoy';
      if (ref === sumarDias(hoy, -1)) return 'Ayer';
      return `${mayuscula(DIAS[diaDeLaSemana(ref)].slice(0, 3))} ${diaMes(ref, hoy)}`;
    case 'SEMANA':
      if (t.desde <= hoy && hoy <= t.hasta) return 'Esta semana';
      return `${diaMes(t.desde, hoy)} – ${diaMes(t.hasta, hoy)}`;
    case 'MES': return mayuscula(MESES[partes(ref).m - 1]) + conAnio(ref, hoy);
    case 'TRIMESTRE': return `${Math.floor((partes(ref).m - 1) / 3) + 1}.º trimestre${conAnio(ref, hoy)}`;
    case 'ANIO': return ref.slice(0, 4);
  }
}

/** La cabecera de un día de la lista: «Hoy, viernes 2 de octubre», «Martes 29 de septiembre». */
export function textoDelDia(ymd: string, hoy: string): string {
  const { m, d } = partes(ymd);
  const largo = `${DIAS[diaDeLaSemana(ymd)]} ${d} de ${MESES[m - 1]}${conAnio(ymd, hoy)}`;
  if (ymd === hoy) return `Hoy, ${largo}`;
  if (ymd === sumarDias(hoy, -1)) return `Ayer, ${largo}`;
  return mayuscula(largo);
}

/**
 * Con qué se compara, en palabras: «septiembre a estas alturas», «la semana pasada»,
 * «agosto». `null` cuando no hay comparación (Hoy).
 */
export function textoDeLaComparacion(periodo: Periodo, visible: Tramo, hoy: string): string | null {
  const anterior = mismoTramoAnterior(periodo, visible);
  if (!anterior) return null;
  const aMedias = visible.hasta !== tramo(periodo, visible.desde).hasta;
  const sufijo = aMedias ? ' a estas alturas' : '';
  switch (periodo) {
    case 'SEMANA': return `la semana anterior${sufijo}`;
    case 'MES': return `${MESES[partes(anterior.desde).m - 1]}${conAnio(anterior.desde, hoy)}${sufijo}`;
    case 'TRIMESTRE': return `el trimestre anterior${sufijo}`;
    case 'ANIO': return `${anterior.desde.slice(0, 4)}${sufijo}`;
    default: return null;
  }
}

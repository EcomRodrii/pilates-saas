// ─────────────────────────────────────────────────────────────────────────────
// Las cifras de la home nueva (panel nuevo, 14-oct-2026). Puro, sin `@/`.
//
// La home de Bonsai enseña la ocupación como «8,3 % · 1/12»: el porcentaje y,
// al lado, las plazas que lo explican. Para que las dos cosas cuadren a la
// vista, aquí la ocupación es PONDERADA por plazas (ocupadas / plazas de las
// clases), no la media de porcentajes por clase que usa la home de siempre:
// con una clase de 4 llena y otra de 12 vacía, la media dice 50 % y las plazas
// dicen 4 de 16. Enseñar «50 % · 4/16» sería enseñar una cuenta que no sale.
//
// Plaza ocupada = reserva CONFIRMADA o ASISTIDA (mismo criterio A-16 que la home
// y que Informes: ni lista de espera ni «no vino»). Solo clases no canceladas
// con aforo.
//
// El día de una clase es el del ESTUDIO (`diaDe`), nunca el del navegador ni UTC.
// ─────────────────────────────────────────────────────────────────────────────

import { importeIngresado, mesAnterior, aCentimos, type ReciboParaCifras } from '../billing/situacion-recibo.ts';

export interface SesionParaCifras {
  id: string;
  inicio: string;
  cancelada?: boolean | null;
  aforoMaximo: number;
}

export interface ReservaParaCifras {
  sesionId: string;
  estado: string;
}

export interface Ocupacion {
  /** 0–100, redondeado. `null` si no hay ninguna clase con aforo: sin clases no hay ocupación, ni del 0 %. */
  pct: number | null;
  ocupadas: number;
  plazas: number;
  clases: number;
}

/** Plazas ocupadas por clase, en una sola pasada. */
export function ocupadasPorSesion(reservas: readonly ReservaParaCifras[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of reservas) {
    if (r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA') m.set(r.sesionId, (m.get(r.sesionId) ?? 0) + 1);
  }
  return m;
}

/**
 * La ocupación de las clases cuyo día (del estudio) cae entre `desde` y `hasta`,
 * ambos incluidos, en 'YYYY-MM-DD'. `diaDe` convierte el inicio de una clase en
 * su día del estudio.
 */
export function ocupacionEntre(
  sesiones: readonly SesionParaCifras[],
  ocupadas: ReadonlyMap<string, number>,
  desde: string,
  hasta: string,
  diaDe: (inicio: string) => string,
): Ocupacion {
  let plazas = 0;
  let llenas = 0;
  let clases = 0;
  for (const s of sesiones) {
    if (s.cancelada || !(s.aforoMaximo > 0)) continue;
    const dia = diaDe(s.inicio);
    if (dia < desde || dia > hasta) continue;
    clases += 1;
    plazas += s.aforoMaximo;
    // Una clase sobrevendida (aforo bajado después) no cuenta más de lo que cabe.
    llenas += Math.min(ocupadas.get(s.id) ?? 0, s.aforoMaximo);
  }
  return { pct: plazas > 0 ? Math.round((llenas / plazas) * 100) : null, ocupadas: llenas, plazas, clases };
}

/** El lunes de la semana (lunes → domingo) de un día 'YYYY-MM-DD'. */
export function lunesDe(dia: string): string {
  const [y, m, d] = dia.split('-').map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  const desdeLunes = (fecha.getUTCDay() + 6) % 7;
  fecha.setUTCDate(fecha.getUTCDate() - desdeLunes);
  return fecha.toISOString().slice(0, 10);
}

/** Suma días a un 'YYYY-MM-DD'. */
function mas(dia: string, n: number): string {
  const [y, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Del lunes al domingo de la semana de `dia`. */
export function semanaDe(dia: string): { desde: string; hasta: string } {
  const desde = lunesDe(dia);
  return { desde, hasta: mas(desde, 6) };
}

/** Número de semana ISO 8601 («Semana 42»): la semana del jueves manda el año. */
export function semanaISO(dia: string): number {
  const [y, m, d] = dia.split('-').map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  const diaSemana = (fecha.getUTCDay() + 6) % 7; // lunes = 0
  fecha.setUTCDate(fecha.getUTCDate() - diaSemana + 3); // el jueves de esta semana
  const primerJueves = new Date(Date.UTC(fecha.getUTCFullYear(), 0, 4));
  const ajuste = (primerJueves.getUTCDay() + 6) % 7;
  primerJueves.setUTCDate(primerJueves.getUTCDate() - ajuste + 3);
  return 1 + Math.round((fecha.getTime() - primerJueves.getTime()) / (7 * 86_400_000));
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export interface IngresoMes {
  /** 'YYYY-MM' */
  clave: string;
  /** «oct», para el eje. */
  etiqueta: string;
  total: number;
  /** El mes en curso (va a medias). */
  actual: boolean;
}

/**
 * Lo ingresado NETO (`importeIngresado`) en los `n` últimos meses, el actual
 * incluido, en el mes de COBRO. El mes sale de `fechaCobro` como texto, igual
 * que la home de siempre: nada de `new Date('YYYY-MM-DD')`, que cae en UTC.
 */
export function ingresosPorMes(
  recibos: readonly ReciboParaCifras[],
  hoy: string,
  n: number,
): IngresoMes[] {
  const claves = [hoy.slice(0, 7)];
  while (claves.length < n) claves.unshift(mesAnterior(claves[0]));
  const total = new Map(claves.map(c => [c, 0]));
  for (const r of recibos) {
    if (!r.fechaCobro) continue;
    const clave = r.fechaCobro.slice(0, 7);
    if (!total.has(clave)) continue;
    const neto = importeIngresado(r);
    if (neto > 0) total.set(clave, (total.get(clave) ?? 0) + neto);
  }
  return claves.map((clave, i) => ({
    clave,
    etiqueta: MESES_CORTOS[Number(clave.slice(5, 7)) - 1],
    total: aCentimos(total.get(clave) ?? 0),
    actual: i === claves.length - 1,
  }));
}

export const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Lo ingresado este mes hasta hoy y el mes pasado hasta el MISMO día (MTD):
 * comparar un mes a medias con el anterior entero da caídas que no existen
 * (mismo criterio que la home de siempre).
 */
export function ingresosAlDia(
  recibos: readonly ReciboParaCifras[],
  hoy: string,
): { actual: number; anterior: number; mesAnterior: string } {
  const claveActual = hoy.slice(0, 7);
  const claveAnterior = mesAnterior(claveActual);
  const diaHoy = Number(hoy.slice(8, 10));
  let actual = 0;
  let anterior = 0;
  for (const r of recibos) {
    if (!r.fechaCobro) continue;
    const clave = r.fechaCobro.slice(0, 7);
    if (clave !== claveActual && clave !== claveAnterior) continue;
    if (Number(r.fechaCobro.slice(8, 10)) > diaHoy) continue;
    const neto = importeIngresado(r);
    if (neto <= 0) continue;
    if (clave === claveActual) actual += neto;
    else anterior += neto;
  }
  return { actual: aCentimos(actual), anterior: aCentimos(anterior), mesAnterior: MESES_LARGOS[Number(claveAnterior.slice(5, 7)) - 1] };
}

// ─── Series para las gráficas de la home (como las de Bonsai) ────────────────

export interface PuntoSerie {
  /** 'YYYY-MM-DD' o 'YYYY-MM' */
  clave: string;
  valor: number;
}

/**
 * Reservas HECHAS cada día (por el día en que se hizo la reserva, no el de la
 * clase), los `n` últimos días con hoy incluido. Cuenta todas, también las que
 * luego se cancelaron: es «cuánto se reserva», como «Reservas últimos días» de
 * Bonsai. `diaDe` da el día del estudio de un instante.
 */
export function reservasPorDia(
  reservas: readonly { creadoEn?: string | null }[],
  hoy: string,
  n: number,
  diaDe: (instante: string) => string,
): PuntoSerie[] {
  const dias: string[] = [];
  for (let i = n - 1; i >= 0; i--) dias.push(mas(hoy, -i));
  const cuenta = new Map(dias.map(d => [d, 0]));
  for (const r of reservas) {
    if (!r.creadoEn) continue;
    const d = diaDe(r.creadoEn);
    if (cuenta.has(d)) cuenta.set(d, (cuenta.get(d) ?? 0) + 1);
  }
  return dias.map(clave => ({ clave, valor: cuenta.get(clave) ?? 0 }));
}

/** Altas de clientas por mes, los `n` últimos meses con el actual incluido. */
export function altasPorMes(
  socios: readonly { fechaAlta?: string | null }[],
  hoy: string,
  n: number,
  diaDe: (instante: string) => string,
): PuntoSerie[] {
  const claves = [hoy.slice(0, 7)];
  while (claves.length < n) claves.unshift(mesAnterior(claves[0]));
  const cuenta = new Map(claves.map(c => [c, 0]));
  for (const s of socios) {
    if (!s.fechaAlta) continue;
    const c = diaDe(s.fechaAlta).slice(0, 7);
    if (cuenta.has(c)) cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
  }
  return claves.map(clave => ({ clave, valor: cuenta.get(clave) ?? 0 }));
}

/**
 * Altas de cada día del mes en curso (la tira «Altas por día este mes» de
 * Bonsai) y cuántas llevaba el mes pasado a estas alturas, para el «+N».
 */
export function altasDelMes(
  socios: readonly { fechaAlta?: string | null }[],
  hoy: string,
  diaDe: (instante: string) => string,
): { porDia: number[]; hoy: number; total: number; mesPasadoAlDia: number } {
  const [y, m] = hoy.split('-').map(Number);
  const diasMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const diaHoy = Number(hoy.slice(8, 10));
  const claveActual = hoy.slice(0, 7);
  const claveAnterior = mesAnterior(claveActual);
  const porDia = Array.from({ length: diasMes }, () => 0);
  let mesPasadoAlDia = 0;
  for (const s of socios) {
    if (!s.fechaAlta) continue;
    const d = diaDe(s.fechaAlta);
    const clave = d.slice(0, 7);
    const dia = Number(d.slice(8, 10));
    if (clave === claveActual) porDia[dia - 1] += 1;
    else if (clave === claveAnterior && dia <= diaHoy) mesPasadoAlDia += 1;
  }
  return { porDia, hoy: diaHoy, total: porDia.reduce((a, b) => a + b, 0), mesPasadoAlDia };
}

/**
 * Las marcas del eje Y: de 0 a un máximo «redondo» (1, 2, 2,5 o 5 por potencia
 * de 10) en `n` tramos. Con todo a cero, 0–4 (una gráfica plana, no rota).
 */
export function marcasEje(max: number, n = 4, enteros = false): number[] {
  if (!(max > 0)) return Array.from({ length: n + 1 }, (_, i) => i);
  // Para contar (reservas, altas) no hay «0,75 altas»: pocos valores, de uno en uno.
  if (enteros && max <= n) return Array.from({ length: Math.ceil(max) + 1 }, (_, i) => i);
  const bruto = max / n;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const pasos = enteros ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  const paso = Math.max(enteros ? 1 : 0, pasos.map(f => f * pot).find(p => p >= bruto) ?? 10 * pot);
  return Array.from({ length: n + 1 }, (_, i) => Math.round(i * paso * 1e6) / 1e6);
}

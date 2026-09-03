// `lib/format.ts` del paquete de diseño, con una diferencia que importa.
//
// ⚠️ ZONA HORARIA. El paquete calcula `hoyISO()` con `new Date().toISOString()`,
// que devuelve el día en UTC. En España eso está mal dos horas cada día: a las
// 00:30 del 4 de septiembre en Madrid, `toISOString()` todavía dice '2026-09-03',
// así que el horario abriría en el día de ayer y «Hoy» señalaría al día
// equivocado. Es el mismo fallo que este repo ya arregló una vez en las fechas
// de cobro de los bonos.
//
// Aquí se resuelve con `Intl.DateTimeFormat` sobre 'Europe/Madrid', que es la
// zona del negocio: todos los estudios de Tentare están en España. Si algún día
// hay estudios en otro huso, esto pasa a salir del estudio y no de una
// constante — pero inventar esa configuración hoy sería adivinar.

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_C = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** La zona del negocio. Todos los estudios de Tentare están en España. */
export const ZONA = 'Europe/Madrid';

/** El día de HOY en Madrid, no en UTC. Ver la nota de arriba. */
export function hoyISO(ahora: Date = new Date()): string {
  // 'en-CA' da directamente YYYY-MM-DD, que es lo que necesitamos.
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(ahora);
}

/**
 * Suma días a una fecha ISO.
 *
 * Se construye a mediodía y no a medianoche a propósito: con `T00:00:00` local,
 * el día del cambio de hora (marzo y octubre) el salto de una hora puede tirar
 * la fecha al día anterior. A las 12:00 sobra margen para los dos sentidos.
 */
export function addDias(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(d);
}

function comoFecha(iso: string): Date {
  return new Date(iso + 'T12:00:00');
}

/** «Hoy», «Mañana» o «Mié 4». Lo que pinta el selector de días y las fichas. */
export function etiquetaDia(iso: string, hoy = hoyISO()): string {
  if (iso === hoy) return 'Hoy';
  if (iso === addDias(hoy, 1)) return 'Mañana';
  const d = comoFecha(iso);
  const corto = DIAS_C[d.getDay()];
  return corto[0].toUpperCase() + corto.slice(1) + ' ' + d.getDate();
}

/** «mié 4 sep» */
export function fechaCorta(iso: string): string {
  const d = comoFecha(iso);
  return DIAS_C[d.getDay()] + ' ' + d.getDate() + ' ' + MESES[d.getMonth()];
}

/** «miércoles 4 de septiembre» */
export function fechaLarga(iso: string): string {
  const d = comoFecha(iso);
  return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES_L[d.getMonth()];
}

/** «Buenos días, Carmen». La hora también es la de Madrid. */
export function saludo(nombre: string, ahora: Date = new Date()): string {
  const h = Number(new Intl.DateTimeFormat('es-ES', { timeZone: ZONA, hour: 'numeric', hour12: false }).format(ahora));
  const parte = h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
  return nombre ? `${parte}, ${nombre}` : parte;
}

/** Importe en euros con el formato español. */
export function euros(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
}

/** «hace 20 min», «hace 3 h», «ayer». Para notificaciones y pagos. */
export function relativo(isoDateTime: string, ahora: Date = new Date()): string {
  const ms = ahora.getTime() - new Date(isoDateTime).getTime();
  const m = Math.round(ms / 60000);
  if (m < 60) return 'hace ' + Math.max(1, m) + ' min';
  const h = Math.round(m / 60);
  if (h < 24) return 'hace ' + h + ' h';
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : 'hace ' + d + ' días';
}

/** La hora de fin, dada la de inicio y la duración. «10:00» + 55 → «10:55». */
export function horaFin(hora: string, duracionMin: number): string {
  const [hh, mm] = hora.split(':').map(Number);
  const t = hh * 60 + mm + duracionMin;
  // El módulo mantiene la hora dentro del día si una clase cruzara medianoche.
  const total = ((t % 1440) + 1440) % 1440;
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

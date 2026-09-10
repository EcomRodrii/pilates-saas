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

/**
 * ⚠️ Devuelve `null` cuando la fecha no es una fecha, y los tres formateadores
 * de abajo devuelven cadena vacía en ese caso.
 *
 * No es defensa preventiva: la cadena vacía es un valor que el mapeo PRODUCE.
 * `proyectarPagos` pone `fecha: r.fechaCobro ?? r.fechaVencimiento ?? ''` — un
 * recibo sin cobrar y sin vencimiento sale con `''`, y con eso `fechaCorta`
 * pintaba literalmente **«undefined NaN undefined»** en la lista de Pagos y en
 * el detalle. Visto en pantalla, no deducido.
 *
 * `etiquetaDia` era peor que fea: `DIAS_C[NaN]` es `undefined` y leer
 * `undefined[0]` LANZA, así que una fecha vacía no ensuciaba la pantalla, la
 * tumbaba entera.
 *
 * Vacío y no «—» a propósito: quien llama decide si ese hueco merece un guion,
 * y varios ya lo hacen (`b.expiraEn ? fechaCorta(b.expiraEn) : 'Sin caducidad'`).
 * Un guion aquí se colaría dentro de esas frases ya resueltas.
 */
function comoFecha(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Une trozos de una línea de apoyo con « · », saltándose los que vengan vacíos.
 *
 * Existe porque el separador estaba escrito a mano entre dos valores que pueden
 * faltar, y entonces se queda huérfano: «Tu instructora · » en la tarjeta de
 * Mensajes cuando la conversación aún no tiene ningún mensaje, o « · Tarjeta»
 * en un recibo sin fecha. Un punto medio suelto no dice nada y se lee como algo
 * que no cargó.
 */
export function unir(...partes: Array<string | null | undefined | false>): string {
  return partes.filter((p): p is string => Boolean(p) && String(p).trim() !== '').join(' · ');
}

/** «Hoy», «Mañana» o «Mié 4». Lo que pinta el selector de días y las fichas. */
export function etiquetaDia(iso: string, hoy = hoyISO()): string {
  if (iso === hoy) return 'Hoy';
  if (iso === addDias(hoy, 1)) return 'Mañana';
  const d = comoFecha(iso);
  if (!d) return '';
  const corto = DIAS_C[d.getDay()];
  return corto[0].toUpperCase() + corto.slice(1) + ' ' + d.getDate();
}

/** «mié 4 sep» */
export function fechaCorta(iso: string): string {
  const d = comoFecha(iso);
  if (!d) return '';
  return DIAS_C[d.getDay()] + ' ' + d.getDate() + ' ' + MESES[d.getMonth()];
}

/** «miércoles 4 de septiembre» */
export function fechaLarga(iso: string): string {
  const d = comoFecha(iso);
  if (!d) return '';
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

/**
 * Lo que se le enseña como precio de una clase cuando NO tiene bono.
 *
 * Tres casos distintos, y antes se pintaban los tres igual («0 €»):
 *   · hay precio            → el importe, el mismo que cobrará el checkout
 *   · precio 0 deliberado   → «Gratis» (una clase de puertas abiertas)
 *   · el estudio no vende sueltas → «Solo con bono», que es la verdad y además
 *     dice qué hacer; «0 €» invitaría a reservar algo que no se puede pagar.
 */
export function precioClaseTexto(c: { precioSuelto: number; sinPrecioSuelto?: boolean }): string {
  if (c.sinPrecioSuelto) return 'Solo con bono';
  if (c.precioSuelto === 0) return 'Gratis';
  return euros(c.precioSuelto);
}

/**
 * Cómo se cobró un recibo, dicho en castellano.
 *
 * ⚠️ Esto se pintaba con el ENUM CRUDO de `recibos.metodo_cobro`: la alumna
 * leía «TARJETA», «EFECTIVO», «TRANSFERENCIA», «BIZUM» y «SEPA» a gritos en
 * mayúsculas, debajo de la fecha de su recibo. Los cinco están en producción
 * (34 recibos con método a fecha de hoy), así que no es un caso de laboratorio.
 *
 * «SEPA» es además jerga: es el nombre del esquema de adeudos europeo, no algo
 * que nadie reconozca en su extracto. El panel ya lo llama «Domiciliación
 * bancaria» (`app/(dashboard)/clientas/page.tsx`) — se usa ESE texto, no uno
 * nuevo, para que el estudio y la alumna nombren lo mismo igual.
 *
 * Un método que no esté en la tabla se devuelve tal cual en vez de tragárselo:
 * un valor nuevo en la columna tiene que verse para poder añadirlo aquí, no
 * desaparecer de la pantalla.
 */
const METODO_COBRO: Record<string, string> = {
  TARJETA: 'Tarjeta',
  SEPA: 'Domiciliación bancaria',
  BIZUM: 'Bizum',
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  DATAFONO: 'Datáfono',
};

export function metodoPagoTexto(metodo: string | null | undefined): string {
  if (!metodo) return '';
  return METODO_COBRO[metodo.toUpperCase()] ?? metodo;
}

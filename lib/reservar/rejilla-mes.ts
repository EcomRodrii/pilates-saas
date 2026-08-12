// La vista MES de la página pública de reservas: un mes de un vistazo, para
// elegir día. Puro y sin React — mismo criterio que `rejilla-semana.ts`.
//
// ⚠️ **La densidad de cada día mide DISPONIBILIDAD, no ocupación.** Es la
// diferencia con la vista mes del panel (`components/calendario/vista-mes.tsx`),
// que pinta `ocupacionMedia` — y está bien que lo haga: a la propietaria le
// importa llenar. A quien viene a reservar le importa lo contrario. Un martes
// con seis clases llenas es un martes *inútil*, y pintarlo como el día más
// intenso del mes sería mandarla justo al peor sitio.
//
// Por eso `plazasLibres` manda sobre `clases`, y un día completo se ve apagado
// aunque tenga más clases que ninguno.

/** Lo mínimo que hace falta de una clase. Es un subconjunto de `ReservaSlot`. */
export interface ClaseDelMes {
  inicio: string;
  aforoMaximo: number;
  ocupadas: number;
}

export type Disponibilidad = 'sin-clases' | 'completo' | 'ultimas' | 'libre';

/** Por debajo de esto se dice «últimas plazas». Igual que la rejilla semanal. */
export const UMBRAL_ULTIMAS = 2;

export interface DiaMes {
  /** `YYYY-MM-DD` local, la clave con la que la página cambia a la vista Día. */
  fecha: string;
  dia: number;
  /** `false` = relleno del mes anterior o siguiente para cuadrar la rejilla. */
  delMes: boolean;
  pasado: boolean;
  clases: number;
  plazasLibres: number;
  disponibilidad: Disponibilidad;
}

function claveLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * El lunes de la semana de `d`. La rejilla empieza en lunes, como el resto del
 * producto (ver `celdaDe` en rejilla-semana.ts).
 */
function lunesDe(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  return r;
}

/**
 * La rejilla del mes que contiene `ancla`, ya con el resumen de cada día.
 *
 * ⚠️ Devuelve **solo las semanas que el mes necesita** (4, 5 o 6), no 42 celdas
 * fijas. Una fila entera vacía al final es peor que la rejilla cambiando de
 * alto: la primera se lee como «esa semana no hay nada», que es mentira — es
 * que no existe.
 *
 * ⚠️ Las fechas se agrupan con la hora del NAVEGADOR, igual que `celdaDe`. Para
 * una clienta que reserva desde la ciudad de su estudio —el caso real— es lo
 * correcto; para una que mire desde otro huso, una clase de madrugada podría
 * caer un día antes. Es una limitación heredada de la rejilla semanal, no una
 * nueva: si algún día se arregla, se arregla en los dos sitios a la vez.
 */
export function rejillaMes(
  ancla: Date,
  clases: readonly ClaseDelMes[],
  hoy: Date,
): DiaMes[] {
  const primero = new Date(ancla.getFullYear(), ancla.getMonth(), 1);
  const ultimo = new Date(ancla.getFullYear(), ancla.getMonth() + 1, 0);
  const desde = lunesDe(primero);
  // El domingo de la semana del último día: así la última fila siempre está
  // completa y nunca sobra una entera.
  const hasta = new Date(ultimo);
  hasta.setDate(hasta.getDate() + (6 - ((hasta.getDay() + 6) % 7)));

  const porDia = new Map<string, { clases: number; libres: number }>();
  for (const c of clases) {
    const d = new Date(c.inicio);
    if (Number.isNaN(d.getTime())) continue;
    const k = claveLocal(d);
    const acc = porDia.get(k) ?? { clases: 0, libres: 0 };
    acc.clases += 1;
    // Nunca negativo: una clase con overbooking (o con el aforo bajado después
    // de llenarse) restaría plazas libres a las demás del mismo día.
    acc.libres += Math.max(0, c.aforoMaximo - c.ocupadas);
    porDia.set(k, acc);
  }

  const claveHoy = claveLocal(hoy);
  const fuera: DiaMes[] = [];
  for (const cur = new Date(desde); cur <= hasta; cur.setDate(cur.getDate() + 1)) {
    const fecha = claveLocal(cur);
    const r = porDia.get(fecha);
    fuera.push({
      fecha,
      dia: cur.getDate(),
      delMes: cur.getMonth() === ancla.getMonth(),
      pasado: fecha < claveHoy,
      clases: r?.clases ?? 0,
      plazasLibres: r?.libres ?? 0,
      disponibilidad: disponibilidadDe(r?.clases ?? 0, r?.libres ?? 0),
    });
  }
  return fuera;
}

/**
 * ⚠️ Un día con clases pero sin ninguna plaza NO es «sin clases»: son dos cosas
 * distintas y la página las pinta distinto. Confundirlas haría desaparecer del
 * calendario un día lleno, que es justo el que interesa mirar para apuntarse a
 * la lista de espera.
 */
export function disponibilidadDe(clases: number, plazasLibres: number): Disponibilidad {
  if (clases === 0) return 'sin-clases';
  if (plazasLibres === 0) return 'completo';
  return plazasLibres <= UMBRAL_ULTIMAS ? 'ultimas' : 'libre';
}

/** Qué se lee al pasar por encima de un día. Sin cifra inventada si no hay nada. */
export function resumenDia(d: DiaMes): string {
  if (d.clases === 0) return 'Sin clases';
  const clases = `${d.clases} ${d.clases === 1 ? 'clase' : 'clases'}`;
  if (d.plazasLibres === 0) return `${clases} · completo`;
  return `${clases} · ${d.plazasLibres} ${d.plazasLibres === 1 ? 'plaza libre' : 'plazas libres'}`;
}

/**
 * «5 de agosto — Sin clases»: lo que oye un lector de pantalla en cada celda.
 *
 * ⚠️ Lleva el MES, no solo el número. Una rejilla de mes enseña días de tres
 * meses distintos (el relleno de los lados), así que «5 — Sin clases» aparecía
 * dos veces idéntico y no había forma de saber cuál era cuál sin verlo. Lo
 * destapó un e2e que chocó con las dos celdas a la vez.
 */
export function etiquetaDia(d: DiaMes): string {
  const fecha = new Date(`${d.fecha}T12:00:00`)
    .toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
  return `${fecha} — ${resumenDia(d)}`;
}

/** «agosto de 2026», para la cabecera del navegador de mes. */
export function etiquetaMes(ancla: Date): string {
  return ancla.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}

// Cómo se dicen los festivos en el panel. Puro y SIN la tabla oficial: lo
// importa la tarjeta de Inicio, y las fechas legales no tienen por qué viajar
// al navegador (las trae el servidor ya filtradas).

export interface FestivoConClases {
  /** YYYY-MM-DD, día civil en España. */
  fecha: string;
  nombre: string;
  clases: number;
  /** Reservas confirmadas de esas clases; null = no se han contado. */
  reservas: number | null;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** «martes 8 de diciembre», y el año solo si no es el de `hoy`. */
export function fechaDelFestivo(iso: string, hoy: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const base = `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
  return iso.slice(0, 4) === hoy.slice(0, 4) ? base : `${base} de ${iso.slice(0, 4)}`;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);

/** «El martes 8 de diciembre (Inmaculada) tienes 6 clases y 41 reservas confirmadas.» */
export function fraseFestivo(f: FestivoConClases, hoy: string): string {
  const cuando = `El ${fechaDelFestivo(f.fecha, hoy)} (${f.nombre})`;
  const clases = plural(f.clases, 'clase', 'clases');
  if (f.reservas === null) return `${cuando} tienes ${clases}.`;
  if (f.reservas === 0) return `${cuando} tienes ${clases}, todavía sin reservas.`;
  return `${cuando} tienes ${clases} y ${plural(f.reservas, 'reserva confirmada', 'reservas confirmadas')}.`;
}

/** El motivo que se guarda en el cierre, para que en «Cierres» se lea qué era. */
export function motivoDelCierre(f: { nombre: string }): string {
  return `Festivo: ${f.nombre}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Módulo Festivos: los tipos y lo que necesita la PANTALLA para enseñar la
// lista. Aparte de modulo.ts a propósito: aquel importa el calendario oficial
// (oficiales.ts) y las fechas legales no tienen por qué viajar al navegador.
// Puro, sin `@/` (lo prueba modulo.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

export type Ambito = 'nacional' | 'autonomico' | 'local' | 'propio';
/**
 * De dónde sale un festivo de la lista:
 *   · oficial → del calendario copiado a mano del boletín (oficiales.ts), por
 *     la dirección del estudio. NO se guarda: sale siempre del código, así que
 *     una corrección o el año nuevo llegan solos y la lista, la bandeja y
 *     «Repetir este mes» dicen siempre lo mismo.
 *   · ia      → lo propuso la búsqueda con IA y la propietaria lo marcó a mano.
 *   · manual  → lo escribió el estudio.
 */
export type Origen = 'oficial' | 'ia' | 'manual';

export const AMBITOS: readonly Ambito[] = ['nacional', 'autonomico', 'local', 'propio'];
/** El nombre más largo que se guarda (lo mismo dice el CHECK de la tabla). */
export const NOMBRE_MAX = 80;

/** Lo que propone la búsqueda con IA: sin guardar, para revisar. */
export interface FestivoPropuesto {
  /** YYYY-MM-DD, día civil en España. */
  fecha: string;
  nombre: string;
  ambito: Ambito;
  /** El dominio de la fuente («barcelona.cat»), o null si no la tiene. */
  fuente: string | null;
  fuenteUrl: string | null;
}

/** Un festivo de la lista del estudio. */
export interface FestivoDeLaLista {
  /** El de la fila guardada; null en un oficial (no se guarda: sale del boletín). */
  id: string | null;
  fecha: string;
  nombre: string;
  ambito: Ambito;
  origen: Origen;
  /** La norma («BOE núm. 259…») o el dominio de la web. */
  fuente: string | null;
  fuenteUrl: string | null;
  /** Lo que el estudio ya decidió de ese día: cerrarlo (hay un cierre) o abrir igualmente. */
  estado: 'cerrado' | 'abierto' | null;
}

// ─── La lista ────────────────────────────────────────────────────────────────

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Los años que tiene la lista, para las píldoras «Todos · 2026 · 2027». */
export function aniosDeLista(festivos: readonly Pick<FestivoDeLaLista, 'fecha'>[], o: { ocultarPasados: boolean; hoy: string }): number[] {
  const anios = new Set(festivos.filter((f) => !o.ocultarPasados || f.fecha >= o.hoy).map((f) => Number(f.fecha.slice(0, 4))));
  return [...anios].sort((a, b) => a - b);
}

/** La lista filtrada y agrupada por año, en orden de fecha. */
export function vistaDeLista<T extends Pick<FestivoDeLaLista, 'fecha' | 'nombre'>>(
  festivos: readonly T[],
  o: { anio: number | 'todos'; busqueda: string; ocultarPasados: boolean; hoy: string },
): { anio: number; festivos: T[] }[] {
  const q = sinTildes(o.busqueda.trim());
  const filtrados = festivos
    .filter((f) => !o.ocultarPasados || f.fecha >= o.hoy)
    .filter((f) => o.anio === 'todos' || Number(f.fecha.slice(0, 4)) === o.anio)
    .filter((f) => !q || sinTildes(f.nombre).includes(q))
    .slice()
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const grupos: { anio: number; festivos: T[] }[] = [];
  for (const f of filtrados) {
    const anio = Number(f.fecha.slice(0, 4));
    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.anio === anio) ultimo.festivos.push(f);
    else grupos.push({ anio, festivos: [f] });
  }
  return grupos;
}

/** El próximo festivo (de hoy en adelante) y cuántos quedan este año y el que viene. */
export function cifrasDeLista(festivos: readonly Pick<FestivoDeLaLista, 'fecha' | 'nombre'>[], hoy: string) {
  const futuros = festivos.filter((f) => f.fecha >= hoy).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
  const anio = Number(hoy.slice(0, 4));
  return {
    proximo: futuros[0] ?? null,
    diasHastaProximo: futuros[0] ? Math.round((Date.parse(`${futuros[0].fecha}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000) : null,
    esteAnio: futuros.filter((f) => Number(f.fecha.slice(0, 4)) === anio).length,
    siguiente: futuros.filter((f) => Number(f.fecha.slice(0, 4)) === anio + 1).length,
  };
}

const MESES_CORTOS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** La hoja de calendario de cada fila: «NOV», «01» y «Domingo». */
export function hojaDeCalendario(iso: string): { mes: string; dia: string; semana: string } {
  const d = new Date(`${iso}T12:00:00Z`);
  return { mes: MESES_CORTOS[d.getUTCMonth()], dia: String(d.getUTCDate()).padStart(2, '0'), semana: DIAS[d.getUTCDay()] };
}

/** La chapa de cada festivo. «Tuyo» para el que escribe el estudio: no es de ningún boletín. */
export const TEXTO_AMBITO: Record<Ambito, string> = {
  nacional: 'Nacional',
  autonomico: 'Autonómico',
  local: 'Local',
  propio: 'Tuyo',
};

const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);

/** «12 festivos». */
export function recuentoDeFestivos(n: number): string {
  return plural(n, 'festivo', 'festivos');
}

/** Lo que dice el botón: «Añadir 2 festivos», y sin ninguno marcado, que marque alguno. */
export function textoAnadir(n: number): string {
  return n === 0 ? 'Marca los que quieras añadir' : `Añadir ${plural(n, 'festivo', 'festivos')}`;
}

// Los trajes de Tenti: lo que se pone por temporada (el gorro de bruja en
// Halloween). Puro, sin DOM: lo prueba node --test, y lo leen el motor (que lo
// dibuja), el icono (su SVG de reserva) y la preferencia de este navegador.
//
// La temporada se cuenta en HORA DE MADRID, no en la del navegador ni en UTC:
// el 1 de noviembre a las 23:59 de Madrid aún es Halloween para un estudio de
// Madrid, aunque en UTC ya sea día 2. Con el cambio de hora del último domingo
// de octubre en medio, una cuenta en UTC adelantaría o retrasaría una hora el
// principio o el final.
//
// Un traje nuevo es una entrada en TRAJES, y el compilador obliga a dibujarlo:
// el motor lleva un `Record<Traje, …>` (lib/tenti/motor.ts) y la geometría otro
// (lib/tenti/geometria.ts), así que un traje sin dibujo no compila.

export interface DefTraje {
  etiqueta: string;
  /** Mes-día en Madrid, ambos incluidos. `desde` > `hasta` = cruza el año (Navidad). */
  temporada: { desde: `${string}-${string}`; hasta: `${string}-${string}` } | null;
  /** Por si faltan los tokens (--tenti-traje-a/-b): los de claro. */
  colores: { a: string; b: string };
}

export const TRAJES = {
  // Del 5 de octubre al 1 de noviembre (decisión del fundador, 5-oct-2026:
  // «ahora, que viene Halloween»). El diseño proponía empezar el 15; el
  // fundador lo quiso desde ya.
  bruja: { etiqueta: 'Gorro de bruja', temporada: { desde: '10-05', hasta: '11-01' }, colores: { a: '#343825', b: '#B8975A' } },
} as const satisfies Record<string, DefTraje>;

export type Traje = keyof typeof TRAJES;

export const LISTA_TRAJES = Object.keys(TRAJES) as Traje[];

export function esTraje(v: unknown): v is Traje {
  return typeof v === 'string' && Object.hasOwn(TRAJES, v);
}

// Una vez por módulo: crear un Intl.DateTimeFormat cuesta (en Clientas era el
// 80 % del coste: memoria «Intl por llamada es caro»).
const MES_DIA_MADRID = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', month: '2-digit', day: '2-digit' });

/** 'MM-DD' de `ahora` en Madrid. */
export function mesDiaEnMadrid(ahora: Date): string {
  let mes = '', dia = '';
  for (const p of MES_DIA_MADRID.formatToParts(ahora)) {
    if (p.type === 'month') mes = p.value;
    else if (p.type === 'day') dia = p.value;
  }
  return `${mes}-${dia}`;
}

/** Si `mesDia` cae en la temporada (ambos extremos incluidos; puede cruzar el año). */
export function enTemporada(mesDia: string, t: NonNullable<DefTraje['temporada']>): boolean {
  return t.desde <= t.hasta ? mesDia >= t.desde && mesDia <= t.hasta : mesDia >= t.desde || mesDia <= t.hasta;
}

/** El traje que toca hoy en Madrid, o null. Si dos coincidieran, el primero de TRAJES. */
export function trajeDeTemporada(ahora: Date, trajes: Record<string, DefTraje> = TRAJES): Traje | null {
  const md = mesDiaEnMadrid(ahora);
  for (const [nombre, def] of Object.entries(trajes)) {
    if (def.temporada && enTemporada(md, def.temporada)) return nombre as Traje;
  }
  return null;
}

/** localStorage de ESTE navegador: un traje ('bruja'), 'ninguno' o nada (el de temporada). */
export const CLAVE_TRAJE = 'tenti-traje';
export const SIN_TRAJE = 'ninguno';

/** Lo que lleva Tenti: 'ninguno' → ninguno; un traje que existe → ese, sea la
 *  época que sea; cualquier otra cosa o nada → el de temporada. */
export function trajeElegido(guardado: string | null | undefined, ahora: Date): Traje | null {
  if (guardado === SIN_TRAJE) return null;
  if (esTraje(guardado)) return guardado;
  return trajeDeTemporada(ahora);
}

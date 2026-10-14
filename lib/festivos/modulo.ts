// ─────────────────────────────────────────────────────────────────────────────
// El módulo «Festivos» del panel nuevo (14-oct-2026), lo puro del servidor: qué
// festivos oficiales tiene el estudio, qué se acepta de la búsqueda con IA y qué
// se puede guardar. Sin IO y sin `@/`, para probarlo con `node --test`
// (modulo.test.ts). Los tipos y lo de pintar la lista, en lista.ts.
//
// Los OFICIALES no se guardan: salen siempre del calendario copiado del boletín
// (oficiales.ts) por la DIRECCIÓN del estudio, la misma regla que el aviso de
// la bandeja y «Repetir este mes». Así la lista, la bandeja y Repetir dicen lo
// mismo, y una corrección o el año nuevo llegan solos. Lo que se guarda
// (`festivos_estudio`) es lo que no está en el boletín: las fiestas locales que
// propone la IA y la propietaria marca, y los días propios del estudio.
// ─────────────────────────────────────────────────────────────────────────────

import { ambitoOficial, aniosConFestivos, festivosEntre, fuenteDe, hayCalendario, type ZonaFestivos } from './oficiales.ts';
import { zonaDelEstudio } from './zona-del-estudio.ts';
import { NOMBRE_MAX, type Ambito, type FestivoDeLaLista, type FestivoPropuesto } from './lista.ts';

export type { Ambito, Origen, FestivoPropuesto, FestivoDeLaLista } from './lista.ts';
export { AMBITOS, NOMBRE_MAX } from './lista.ts';

/** Lo que se guarda de una vez. */
export const MAX_POR_GUARDADO = 60;
/** Lo que se acepta de la IA: un municipio tiene 2 fiestas locales al año (Estatuto, art. 37.2). */
export const MAX_PROPUESTOS_IA = 30;

/**
 * Búsquedas con IA al día (día de Madrid). Cada una son hasta 4 búsquedas web
 * con Opus (entre 0,1 y 0,4 € cada una). Un estudio busca sus festivos una o dos
 * veces al año, así que el tope solo frena un bucle o un abuso.
 */
export const TOPE_BUSQUEDAS_CUENTA_DIA = 6;
export const TOPE_BUSQUEDAS_ESTUDIO_DIA = 6;
export const TOPE_BUSQUEDAS_TOTAL_DIA = 60;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** ¿Es un día que existe? («2027-02-30» no). */
export function esFecha(s: unknown): s is string {
  return typeof s === 'string' && FECHA.test(s) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;
}

/** Como Bonsai: de hoy a final del año que viene. `hoy` es el del estudio (`hoyEnEstudio`). */
export function rangoDeBusqueda(hoy: string): { desde: string; hasta: string; anios: number[] } {
  const anio = Number(hoy.slice(0, 4));
  return { desde: hoy, hasta: `${anio + 1}-12-31`, anios: [anio, anio + 1] };
}

/**
 * La comunidad de lo que se ha escrito en «Tu localidad» (un código postal de
 * cinco cifras o el municipio, con la lista cerrada de la dirección), para
 * AVISAR si no es la de la dirección del estudio: los oficiales salen siempre
 * de la dirección. null = no la reconocemos.
 */
export function zonaDeLocalidad(texto: string): ZonaFestivos | null {
  const limpio = texto.trim();
  if (!limpio) return null;
  const cp = limpio.match(/\b\d{5}\b/)?.[0] ?? null;
  const ciudad = limpio.replace(/\b\d{5}\b/, ' ').replace(/\s+/g, ' ').trim();
  return zonaDelEstudio({ codigoPostal: cp, ciudad: ciudad || null, direccion: null, zonaHoraria: 'Europe/Madrid' });
}

/** «BOE núm. 259, de 28 de octubre de 2025» de la cita entera; si no se encuentra, la cita recortada. */
export function normaCorta(fuente: string): string {
  const diario = fuente.match(/\((?:BOE|BOCM|BOJA|DOGC)[^)]*\)/)?.[0];
  if (diario) return diario.slice(1, -1).split(',').slice(0, 2).join(',').trim();
  return fuente.length > 90 ? `${fuente.slice(0, 87).trimEnd()}…` : fuente;
}

/**
 * Los oficiales de la zona en un rango, como filas de la lista (sin id: no se
 * guardan), con su ámbito y la norma de la que salen.
 */
export function oficialesDeLaLista(zona: ZonaFestivos, desde: string, hasta: string): FestivoDeLaLista[] {
  return festivosEntre(zona, desde, hasta).map((f) => {
    const fuente = fuenteDe(zona, Number(f.fecha.slice(0, 4)));
    return {
      id: null,
      fecha: f.fecha,
      nombre: f.nombre,
      ambito: ambitoOficial(zona, f.fecha),
      origen: 'oficial' as const,
      fuente: fuente ? normaCorta(fuente.fuente) : null,
      fuenteUrl: fuente?.url ?? null,
      estado: null,
    };
  });
}

/** El rango de la lista: del 1 de enero de este año al final del último con calendario de la zona (o del que viene). */
export function rangoDeLaLista(hoy: string, zona: ZonaFestivos | null): { desde: string; hasta: string } {
  const anio = Number(hoy.slice(0, 4));
  const ultimo = Math.max(anio + 1, ...(zona ? aniosConFestivos(zona) : []));
  return { desde: `${anio}-01-01`, hasta: `${ultimo}-12-31` };
}

/** Años del rango con calendario oficial cargado para esa zona (ninguno, sin zona). */
export function aniosConCalendario(zona: ZonaFestivos | null, anios: readonly number[]): Set<number> {
  return new Set(anios.filter((a) => !!zona && hayCalendario(zona, `${a}-01-01`)));
}

/** Quita lo que no es texto de una fila: saltos, controles, espacios dobles. */
export function limpiarNombre(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > NOMBRE_MAX) return null;
  return t;
}

/** Solo https, sin credenciales ni espacios y con un tamaño razonable; si no, sin enlace. */
export function urlSegura(s: unknown): string | null {
  if (typeof s !== 'string' || s.length > 500 || /\s/.test(s)) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** «barcelona.cat», para enseñar de dónde sale sin pegar la URL entera. */
export function dominioDe(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * ¿Es una fuente que la búsqueda ha visto de verdad? La URL la escribe el
 * modelo, así que no es una cita: solo se enseña si está entre las páginas que
 * devolvió la búsqueda (o es del mismo sitio que una de ellas). Si no, sin enlace.
 */
export function fuenteVista(url: string | null, vistas: ReadonlySet<string>): string | null {
  if (!url) return null;
  if (vistas.has(url)) return url;
  const dominio = dominioDe(url);
  for (const v of vistas) if (dominio && dominioDe(v) === dominio) return url;
  return null;
}

/**
 * Lo que devuelve la IA, ya filtrado: fechas reales dentro del rango, nombres
 * cortos, ámbito conocido, fuente vista en la búsqueda o ninguna, sin un día
 * que ya trae el calendario oficial y sin repetir. En un año con calendario
 * oficial de la zona solo se acepta lo LOCAL (lo nacional y lo autonómico ya
 * sale del boletín). Todo lo demás se descarta: es texto de un modelo y aquí se
 * trata como un dato que no es de fiar.
 */
export function limpiarPropuestosIA(
  crudo: unknown,
  o: { desde: string; hasta: string; fechasOficiales: ReadonlySet<string>; aniosConCalendario: ReadonlySet<number>; fuentesVistas: ReadonlySet<string> },
): FestivoPropuesto[] {
  if (!Array.isArray(crudo)) return [];
  const vistos = new Set<string>();
  const out: FestivoPropuesto[] = [];
  for (const x of crudo) {
    if (out.length >= MAX_PROPUESTOS_IA) break;
    const f = x as Record<string, unknown> | null;
    if (!f || !esFecha(f.fecha) || f.fecha < o.desde || f.fecha > o.hasta) continue;
    if (o.fechasOficiales.has(f.fecha) || vistos.has(f.fecha)) continue;
    const nombre = limpiarNombre(f.nombre);
    if (!nombre) continue;
    const ambito = f.ambito === 'nacional' || f.ambito === 'autonomico' || f.ambito === 'local' ? f.ambito : null;
    if (!ambito || (o.aniosConCalendario.has(Number(f.fecha.slice(0, 4))) && ambito !== 'local')) continue;
    const fuenteUrl = fuenteVista(urlSegura(f.fuente_url), o.fuentesVistas);
    vistos.add(f.fecha);
    out.push({ fecha: f.fecha, nombre, ambito, fuente: dominioDe(fuenteUrl), fuenteUrl });
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export interface FilaParaGuardar {
  fecha: string;
  nombre: string;
  ambito: Ambito;
  origen: 'ia' | 'manual';
  fuente_url: string | null;
}

/**
 * Lo que llega del navegador para guardar, comprobado: solo lo que NO es
 * oficial (lo de la IA y lo escrito a mano), nunca en un día que ya es festivo
 * oficial del estudio, ni antes de hoy ni más allá del año que viene. Lo de la
 * IA, en un año con calendario oficial, solo como fiesta local. Dos filas del
 * mismo día: vale la primera.
 */
export function prepararParaGuardar(
  items: unknown,
  o: { zona: ZonaFestivos | null; hoy: string },
): { ok: true; filas: FilaParaGuardar[] } | { ok: false; error: string } {
  if (!Array.isArray(items) || items.length === 0) return { ok: false, error: 'No has elegido ningún festivo.' };
  if (items.length > MAX_POR_GUARDADO) return { ok: false, error: `Como mucho ${MAX_POR_GUARDADO} festivos de una vez.` };
  const { hasta, anios } = rangoDeBusqueda(o.hoy);
  const oficiales = new Set(o.zona ? festivosEntre(o.zona, o.hoy, hasta).map((f) => f.fecha) : []);
  const conCalendario = aniosConCalendario(o.zona, anios);
  const vistos = new Set<string>();
  const filas: FilaParaGuardar[] = [];
  for (const x of items) {
    const f = x as Record<string, unknown> | null;
    if (!f || !esFecha(f.fecha)) return { ok: false, error: 'Hay un día que no es una fecha.' };
    if (f.fecha < o.hoy) return { ok: false, error: 'No se guardan festivos que ya han pasado.' };
    if (f.fecha > hasta) return { ok: false, error: `Solo se guardan festivos hasta el 31 de diciembre de ${hasta.slice(0, 4)}.` };
    if (oficiales.has(f.fecha)) return { ok: false, error: 'Ese día ya es festivo oficial: ya está en tu lista.' };
    if (vistos.has(f.fecha)) continue;
    const nombre = limpiarNombre(f.nombre);
    if (f.origen === 'ia') {
      const ambito = f.ambito === 'nacional' || f.ambito === 'autonomico' || f.ambito === 'local' ? f.ambito : null;
      if (!nombre || !ambito) return { ok: false, error: 'Uno de los festivos propuestos no ha llegado bien. Vuelve a buscar.' };
      if (conCalendario.has(Number(f.fecha.slice(0, 4))) && ambito !== 'local') {
        return { ok: false, error: 'Uno de los festivos propuestos no es una fiesta local. Vuelve a buscar.' };
      }
      filas.push({ fecha: f.fecha, nombre, ambito, origen: 'ia', fuente_url: urlSegura(f.fuenteUrl) });
    } else if (f.origen === 'manual') {
      if (!nombre) return { ok: false, error: `Ponle un nombre de hasta ${NOMBRE_MAX} letras.` };
      filas.push({ fecha: f.fecha, nombre, ambito: 'propio', origen: 'manual', fuente_url: null });
    } else {
      return { ok: false, error: 'Los festivos oficiales ya están en tu lista: no hace falta añadirlos.' };
    }
    vistos.add(f.fecha);
  }
  return { ok: true, filas };
}

/**
 * La lista del estudio: los oficiales de su zona y lo que ha guardado, sin
 * repetir un día (manda el oficial), en orden.
 */
export function unirLista(oficiales: readonly FestivoDeLaLista[], guardados: readonly FestivoDeLaLista[]): FestivoDeLaLista[] {
  const deOficiales = new Set(oficiales.map((f) => f.fecha));
  return [...oficiales, ...guardados.filter((g) => !deOficiales.has(g.fecha))].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

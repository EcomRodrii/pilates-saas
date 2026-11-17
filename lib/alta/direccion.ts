// ─────────────────────────────────────────────────────────────────────────────
// La dirección que le va a tocar a un estudio nuevo — lógica pura (sin red ni
// Supabase), para que `direccion.test.ts` pruebe lo mismo que decide la ruta y
// que enseña el alta.
//
// `generateUniqueSlug` (lib/supabase-data.ts) es quien la decide DE VERDAD al
// crear el estudio: la base (`slugify(nombre)`), y si ya es de otro estudio o es
// una palabra de la aplicación, «-2», «-3»… Esto es la misma cuenta hecha antes,
// para decírselo mientras escribe. Si las dos discreparan, el alta prometería una
// dirección y entregaría otra: por eso la lista de candidatas es UNA y la comparte
// la ruta (qué mirar en la base) y la resolución (cuál toca).
// ─────────────────────────────────────────────────────────────────────────────

import { RESERVADAS, slugify } from '../slug.ts';

/** Cuántas candidatas se miran de golpe: la base y «-2»…«-5». Más allá, «desconocido». */
export const CANDIDATAS_MAX = 5;
/** Un nombre más largo no cambia la dirección que importa: se corta antes de mirar. */
export const NOMBRE_MAX_DIRECCION = 120;

export type EstadoDireccion =
  /** La base está libre: la dirección será exactamente esa. */
  | 'libre'
  /** La base es de otro estudio o una palabra de la aplicación: se le añade un número. */
  | 'con_numero'
  /** Ni con número se ha encontrado una libre en las candidatas miradas. */
  | 'agotada'
  /** No se ha podido comprobar: no se promete nada. */
  | 'desconocido';

export interface DireccionResuelta {
  base: string;
  estado: EstadoDireccion;
  /** La que le tocaría ahora (la primera libre); `null` si no se sabe. */
  asignada: string | null;
  /** La base es una palabra de la aplicación (no es que la tenga otro estudio). */
  reservada: boolean;
  /** Todas las candidatas libres, en orden (incluida `asignada`): de aquí se puede ELEGIR otra. */
  libres: string[];
}

/** Cuántas alternativas se enseñan además de la que toca. */
export const ALTERNATIVAS_MAX = 3;

/** Las alternativas a la que toca: otras candidatas libres, sin pasar de ALTERNATIVAS_MAX. */
export function alternativasDireccion(d: Pick<DireccionResuelta, 'libres' | 'asignada'> | null): string[] {
  if (!d || !Array.isArray(d.libres)) return [];
  return d.libres.filter((c) => c !== d.asignada).slice(0, ALTERNATIVAS_MAX);
}

/**
 * ¿Vale esa dirección ELEGIDA? Solo si sigue entre las libres de la última respuesta. Una elección
 * vieja (el nombre cambió, la respuesta es de otra base) no vale y se vuelve a la que toca.
 */
export function direccionElegidaVale(elegida: string | null, d: Pick<DireccionResuelta, 'libres'> | null): boolean {
  return !!elegida && !!d && Array.isArray(d.libres) && d.libres.includes(elegida);
}

/** La base de un nombre: la misma que usa el alta al crear el estudio. */
export function baseDeDireccion(nombre: string): string {
  return slugify(nombre.slice(0, NOMBRE_MAX_DIRECCION));
}

/** Las direcciones que hay que mirar en la base de datos, en orden de preferencia. */
export function candidatasDireccion(base: string): string[] {
  const salida = [base];
  for (let n = 2; n <= CANDIDATAS_MAX; n++) salida.push(`${base}-${n}`);
  return salida;
}

/**
 * Cuál toca, dadas las que YA existen (`ocupadas`). Una palabra de la aplicación
 * cuenta como ocupada igual que en `generateUniqueSlug`. `ocupadas` = `null` si
 * la lectura falló: entonces no se sabe y no se promete.
 */
export function resolverDireccion(base: string, ocupadas: ReadonlySet<string> | null): DireccionResuelta {
  const reservada = RESERVADAS.has(base);
  if (!ocupadas) return { base, estado: 'desconocido', asignada: null, reservada, libres: [] };
  const candidatas = candidatasDireccion(base);
  const libres = candidatas.filter((c) => !RESERVADAS.has(c) && !ocupadas.has(c));
  const libre = libres[0];
  if (!libre) return { base, estado: 'agotada', asignada: null, reservada, libres: [] };
  return { base, estado: libre === base ? 'libre' : 'con_numero', asignada: libre, reservada, libres };
}

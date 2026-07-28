import type { PostgrestFilterBuilder } from '@supabase/postgrest-js';

// ─────────────────────────────────────────────────────────────────────────────
// Leer un catálogo ENTERO para deduplicar o emparejar durante una importación.
//
// PostgREST corta las respuestas en `max_rows` (1000 por defecto, y así está en
// supabase/config.toml:18) y lo hace EN SILENCIO: devuelve 1000 filas sin error
// y sin ninguna señal de que faltan más. Los importadores leían así los
// catálogos con los que deciden si una fila es nueva o ya existe:
//
//   · socias por email     → si el catálogo llega corto, reimportar DUPLICA
//     clientas que ya estaban, porque no las encuentra.
//   · sesiones, planes, salas, instructoras → si llega corto, filas perfectamente
//     válidas se rechazan con "no existe esa socia/clase", que es un mensaje que
//     además miente sobre la causa.
//
// Con 850 clientas no se nota. A partir de 1000 sí, y el fallo aparece justo el
// día que más duele: el de la migración de un estudio grande.
//
// El repo ya tenía este arreglo en lib/supabase-data.ts (`fetchAllRows`), pero
// nunca llegó a las rutas de importación. Esto es su equivalente para servidor.
// ─────────────────────────────────────────────────────────────────────────────

/** Por debajo del `max_rows` de PostgREST, para que el corte lo decidamos aquí. */
const PAGINA = 1000;

/**
 * Trae TODAS las filas de una consulta, paginando con `.range()`.
 *
 * `construir(desde, hasta)` debe devolver la consulta ya filtrada por estudio.
 * Se pide una página de más para detectar el final: cuando una página vuelve
 * incompleta, no hay más.
 *
 * `tope` es una red de seguridad contra un bucle infinito si el backend
 * devolviera siempre páginas llenas; al alcanzarlo se corta y se avisa por el
 * valor de retorno en vez de seguir para siempre.
 */
export async function leerCatalogoCompleto<T>(
  construir: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  tope = 100_000,
): Promise<{ filas: T[]; truncado: boolean }> {
  const filas: T[] = [];
  for (let desde = 0; desde < tope; desde += PAGINA) {
    const { data, error } = await construir(desde, desde + PAGINA - 1);
    if (error) throw error;
    const pagina = data ?? [];
    filas.push(...pagina);
    if (pagina.length < PAGINA) return { filas, truncado: false };
  }
  return { filas, truncado: true };
}

/**
 * Igual que `leerCatalogoCompleto`, pero devuelve la MISMA forma que PostgREST
 * (`{ data, error }`) para poder sustituir una consulta suelta sin tocar el
 * código de alrededor, que ya desestructura así y comprueba `error`.
 */
export async function catalogo<T>(
  construir: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ data: T[] | null; error: unknown }> {
  try {
    const { filas } = await leerCatalogoCompleto<T>(construir);
    return { data: filas, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

export type { PostgrestFilterBuilder };

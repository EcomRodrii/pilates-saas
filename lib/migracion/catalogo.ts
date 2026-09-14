import type { PostgrestFilterBuilder } from '@supabase/postgrest-js';
// Con extensión `.ts`: `node --test` no resuelve los imports sin extensión, y
// este módulo lo arrastra `lib/engines/backup-engine.test.ts`.
import { conReintentoTransitorio } from '../reintento-transitorio.ts';

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
 * ⚠️ `construir` DEBE incluir un `.order(...)` por una columna única (`id` sirve
 * en todas las tablas de este repo). Sin ORDER BY, Postgres no garantiza que
 * LIMIT/OFFSET devuelva páginas disjuntas: una fila puede repetirse en dos
 * páginas y otra no salir en ninguna. Y una fila que se pierde aquí es
 * exactamente el fallo que este módulo existe para evitar —el catálogo llega
 * corto y reimportar duplica—, solo que más difícil de ver porque depende del
 * plan de ejecución.
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
    // Reintento ante un 504 del pooler, igual que `fetchAllRows` desde la 59ª
    // pasada (M-11). NO es simetría por gusto: este paginador es el que usa la
    // copia de seguridad diaria (`lib/engines/backup-engine.ts`), y un solo
    // "Gateway Timeout" en cualquiera de sus ~80 tablas tiraba el snapshot
    // ENTERO de ese estudio. Medido el 14-sep: studio-1 llevaba CINCO noches
    // seguidas sin copia automática (última DIARIA el 9-sep) con 140 sesiones
    // y 222 reservas — o sea, sin nada que ver con el volumen. El arreglo de
    // #1936 se hizo en `fetchAllRows` y no llegó a su gemelo, que es este.
    const { resultado } = await conReintentoTransitorio(async () => {
      const r = await construir(desde, desde + PAGINA - 1);
      const mensaje = (r.error as { message?: unknown } | null)?.message;
      return {
        data: r.data,
        error: r.error ? { message: typeof mensaje === 'string' ? mensaje : '', causa: r.error } : null,
      };
    });
    const { data } = resultado;
    if (resultado.error) throw resultado.error.causa;
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

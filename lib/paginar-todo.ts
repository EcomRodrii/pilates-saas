// Núcleo de `fetchAllRows` (lib/supabase-data.ts): lee una tabla entera en
// páginas. Vive aparte y SIN imports de `@/...` para poder probarse con
// `node --test` (ese alias rompe el runner; ver lib/reintento-transitorio.ts).
//
// Cómo pagina: la primera página va sola (si no viene llena, no hay más). Si
// viene llena, el resto se pide por OLAS de `concurrencia` páginas a la vez y
// se recompone en orden de página. Antes era una cadena en serie: N páginas =
// N viajes (~110 ms cada uno); ahora son 1 + ceil((N-1)/concurrencia).
//
// ⚠️ Paginar con `.range()` solo es correcto con un orden TOTAL y estable
// (la PK, o una columna + la PK de desempate). Sin él, un INSERT/UPDATE entre
// dos páginas repite u omite filas. Lo exige `lib/paginar-todo-orden.test.ts`
// en cada llamada a `fetchAllRows`; este módulo no puede comprobarlo.
//
// Semántica que se mantiene respecto a la versión en serie:
//  - una página que falla (tras el reintento de 504 transitorios) corta la
//    carga: se devuelven las filas de las páginas ANTERIORES y el error;
//  - una página vacía o corta es el final;
//  - `data` nunca es null.

import { conReintentoTransitorio } from './reintento-transitorio.ts';

export const TAMANO_PAGINA = 1000;
export const CONCURRENCIA_PAGINAS = 4;

export type ErrorPagina = { message: string };
export type ResultadoPagina<T> = { data: T[] | null; error: ErrorPagina | null };

export interface OpcionesPaginar {
  tamano?: number;
  concurrencia?: number;
  /** Para reportar (Sentry): se llama una vez, con la página que falló. */
  alFallar?: (error: ErrorPagina, desde: number, reintentado: boolean) => void;
}

export async function paginarTodo<T>(
  pagina: (from: number, to: number) => PromiseLike<ResultadoPagina<T>>,
  opciones: OpcionesPaginar = {},
): Promise<{ data: T[]; error: ErrorPagina | null }> {
  const tamano = opciones.tamano ?? TAMANO_PAGINA;
  const concurrencia = Math.max(1, opciones.concurrencia ?? CONCURRENCIA_PAGINAS);
  const filas: T[] = [];

  const leer = (desde: number) =>
    conReintentoTransitorio(() => pagina(desde, desde + tamano - 1));

  // Devuelve true si hay que seguir; el error, si lo hay, va en `fallo`.
  let fallo: ErrorPagina | null = null;
  const absorber = (
    r: { resultado: ResultadoPagina<T>; reintentos: number },
    desde: number,
  ): boolean => {
    const { data, error } = r.resultado;
    if (error) {
      opciones.alFallar?.(error, desde, r.reintentos > 0);
      fallo = error;
      return false;
    }
    if (!data || data.length === 0) return false;
    for (const fila of data) filas.push(fila);
    return data.length >= tamano;
  };

  let siguiente = 0;
  if (!absorber(await leer(0), 0)) return { data: filas, error: fallo };
  siguiente = tamano;

  for (;;) {
    const desdes = Array.from({ length: concurrencia }, (_, i) => siguiente + i * tamano);
    const olas = await Promise.allSettled(desdes.map((d) => leer(d)));
    for (let i = 0; i < olas.length; i++) {
      const o = olas[i];
      // Una excepción (no un `{ error }`) se propaga como antes, pero sin
      // dejar promesas sueltas: allSettled ya esperó a todas.
      if (o.status === 'rejected') throw o.reason;
      if (!absorber(o.value, desdes[i])) return { data: filas, error: fallo };
    }
    siguiente += concurrencia * tamano;
  }
}

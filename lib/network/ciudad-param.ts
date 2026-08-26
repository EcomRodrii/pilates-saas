/**
 * Ciudad de la URL de las páginas SEO del marketplace
 * (`/network/instructoras/ciudad/[ciudad]` y su variante ×especialidad).
 *
 * Estaba duplicado literal en los dos `page.tsx` y no validaba nada: el texto
 * de la URL viajaba entero al `<title>`, al `<h1>` y al filtro `.ilike` de la
 * búsqueda. Con la especialidad no pasaba —esa sí se comprueba contra su
 * catálogo con `esEspecialidadValida`—, así que la asimetría era el hallazgo.
 *
 * `null` significa 404, no "ciudad vacía": una cadena que no tiene forma de
 * topónimo no es una ciudad desconocida, es una URL fabricada. Fallar en
 * cerrado también le quita al buscador el espacio ilimitado de URLs indexables
 * que abría el guardia de indexación (que mide "¿hay resultados?" y con un
 * comodín en la URL siempre los había).
 */
// La clase tiene que admitir TODO lo que `slugCiudadUrl` (lib/network/publico.ts)
// es capaz de meter en una URL, porque esas URLs las publica el propio sitemap:
// ese helper solo cambia espacios por guiones, así que apóstrofos, comas,
// puntos, paréntesis, el punto volado y la barra de los topónimos bilingües
// llegan intactos. Una primera versión de este regex era `[\p{L}\p{N} -]` y
// habría devuelto 404 en «L'Hospitalet de Llobregat», «Sant Joan d'Alacant»,
// «Nucia, la» o «Donostia/San Sebastián» — páginas que hoy funcionan y que
// Tentare enlaza desde su propio sitemap.
//
// Lo que sigue fuera es lo que importa: `%` y `_` (comodines de ILIKE), `*`
// (que PostgREST traduce a `%`), `<`/`>` y cualquier otro texto arbitrario que
// acabaría en el `<title>` y el `<h1>` de una página indexable.
const CIUDAD_VALIDA = /^[\p{L}\p{N} '’·.,()/-]{1,60}$/u;

export function ciudadDesdeParam(param: string): string | null {
  let crudo: string;
  try {
    crudo = decodeURIComponent(param);
  } catch {
    return null; // `%ZZ` y demás secuencias percent-encoding mal formadas
  }
  // `\b\w` era ASCII: en «A Coruña» la `ñ` no es `\w`, así que la `a` siguiente
  // contaba como inicio de palabra y el `<title>` decía «A CoruñA». Con
  // `\p{L}` la inicial es la primera letra tras un separador de verdad.
  const ciudad = crudo
    .replace(/-/g, ' ')
    .replace(/(^|\s)(\p{L})/gu, (_, sep: string, inicial: string) => sep + inicial.toUpperCase());
  return CIUDAD_VALIDA.test(ciudad) ? ciudad : null;
}

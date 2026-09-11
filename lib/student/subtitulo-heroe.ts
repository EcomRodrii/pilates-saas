// La línea que va bajo el saludo, en el héroe de Inicio.
//
// ⚠️ Este hueco es DISTINTO de los otros tres textos de marca (`lema`,
// `fraseHeroe`, `fraseManuscrita`): aquellos nacieron vacíos, así que sin
// escribirlos no se pinta nada. Este ya tenía texto antes de ser configurable,
// y por eso vacío NO es «no se pinta» sino «se pinta el del producto». Si no,
// añadir la columna le habría cambiado el héroe a los trece estudios sin que
// nadie lo hubiera pedido.
//
// Vive fuera del componente para poder probar las dos ramas con `node --test`:
// la del estudio que lo ha escrito y la del que no.

/** Lo que dice el producto cuando el estudio no ha escrito nada. */
export const SUBTITULO_POR_DEFECTO = '¿Qué te apetece hoy?';

/**
 * `null`, `undefined` y una cadena en blanco son lo mismo aquí: el estudio no
 * ha escrito nada. Los tres pasan por el mismo camino — un estudio que borra
 * el campo y guarda no puede acabar con un héroe con una línea vacía.
 */
export function subtituloDelHeroe(escrito: string | null | undefined): string {
  return escrito?.trim() || SUBTITULO_POR_DEFECTO;
}

/**
 * Escapa los comodines de un valor que se va a incrustar en un patrón `.ilike()`.
 *
 * Vive en `lib/` y no bajo `lib/network/` porque tiene dos familias de
 * llamantes —el buscador del marketplace y las búsquedas de ficha por email de
 * facturación— y la regla del repo es que una defensa duplicada acaba
 * arreglándose en un sitio y no en el gemelo. `lib/billing/socia-nueva.ts` ya
 * llevaba esta misma lógica escrita a mano, con el mismo razonamiento sobre `*`.
 *
 * Sin esto, el texto del buscador ES el patrón. `/network/instructoras/ciudad/%`
 * llegaba a `query.ilike('ciudad', '%%%')`, que casa con TODAS las ciudades:
 * un filtro que el usuario elige convertido en "devuélvemelo todo". Y como el
 * guardia de indexación de esas páginas mide "¿hay algún resultado?", una URL
 * con `%` siempre daba resultados y quedaba indexable — espacio de URLs
 * ilimitado bajo el dominio, con `<title>` y `<h1>` de texto arbitrario.
 *
 * Tres caracteres, tres motivos:
 * - `\` primero, o se re-escaparían las barras que añadimos después.
 * - `%` y `_` son los comodines de LIKE en Postgres.
 * - `*` se borra en vez de escaparse: PostgREST lo traduce a `%` por su cuenta
 *   antes de que la cadena llegue a Postgres, así que escaparlo aquí depende
 *   de en qué orden ocurren las dos traducciones. Un `*` no es parte de ningún
 *   nombre de ciudad ni de estudio; quitarlo es la opción que no hay que
 *   razonar dos veces.
 */
export function escaparLike(valor: string): string {
  return valor.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, '');
}

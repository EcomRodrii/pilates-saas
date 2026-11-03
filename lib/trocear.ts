// Parte una lista en trozos de como mucho `tamano`. Sin imports: se prueba con `node --test`.
//
// Para `.in('col', ids)` de PostgREST: la lista va en la URL y el pasarela corta alrededor de los 16 KB con un
// «Bad Request» pelado. Un estudio con ~1.200 clases futuras (22 caracteres por id) ya la pasa: el catálogo público
// de ese estudio dejaba de servirse entero.
export function trocear<T>(lista: readonly T[], tamano: number): T[][] {
  if (!(tamano >= 1)) throw new Error('trocear: el tamaño tiene que ser al menos 1');
  const trozos: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) trozos.push(lista.slice(i, i + tamano));
  return trozos;
}

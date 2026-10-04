/**
 * El texto de «Busca tu estudio», o `null` si no se debe buscar: menos de 3 letras
 * (devolvería medio catálogo) o nada. Los comodines se escapan en la propia llamada
 * a `.ilike` con `escaparLike` (lo exige lib/escapar-like-en-toda-ilike.test.ts).
 */
export function textoBusquedaEstudio(q: string | null | undefined): string | null {
  const limpio = (q ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return limpio.length < 3 ? null : limpio;
}

/** Minúsculas y sin tildes ni diéresis: «Núcleo» y «nucleo» son lo mismo. */
export function sinTildes(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * El patrón YA escapado, con cada vocal como comodín de una letra: así `.ilike`
 * encuentra «Núcleo» buscando «nucleo» (y al revés) sin extensiones en la base.
 * Trae de más («nucleo» también casa con «nuclea»), y por eso el resultado se
 * vuelve a filtrar con `coincideEstudio`.
 */
export function vocalesComodin(patronEscapado: string): string {
  return patronEscapado.replace(/[aeiouáéíóúàèìòùäëïöüâêîôû]/gi, '_');
}

/** El filtro de verdad, sin tildes ni mayúsculas, sobre lo que trajo la base. */
export function coincideEstudio(nombre: string, texto: string): boolean {
  return sinTildes(nombre).includes(sinTildes(texto));
}

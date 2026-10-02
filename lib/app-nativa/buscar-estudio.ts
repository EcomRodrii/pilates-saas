/**
 * El texto de «Busca tu estudio», o `null` si no se debe buscar: menos de 3 letras
 * (devolvería medio catálogo) o nada. Los comodines se escapan en la propia llamada
 * a `.ilike` con `escaparLike` (lo exige lib/escapar-like-en-toda-ilike.test.ts).
 */
export function textoBusquedaEstudio(q: string | null | undefined): string | null {
  const limpio = (q ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return limpio.length < 3 ? null : limpio;
}

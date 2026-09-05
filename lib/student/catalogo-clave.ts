// Clave de la caché del catálogo. Sin imports ni `@/` (ver push-estado.ts).
//
// El payload de `studio-data` lleva la `socia` de quien está dentro (reservas,
// bonos, recibos, ficha). Cachearlo solo por estudio servía durante el TTL los
// datos de la alumna anterior a la siguiente que entrara en el mismo
// dispositivo (tablet del mostrador). La identidad forma parte de la clave, y
// «anónima» es una identidad distinta de cualquier autenticada.

export const ANONIMA = 'anon';

export function claveCatalogo(slug: string, userId: string | null | undefined): string {
  return `${slug}|${userId || ANONIMA}`;
}

/** Borra de un mapa todas las entradas de un estudio, sean de quien sean. */
export function borrarPorSlug<T>(mapa: Map<string, T>, slug: string): number {
  let n = 0;
  for (const k of Array.from(mapa.keys())) {
    if (k.startsWith(`${slug}|`)) { mapa.delete(k); n++; }
  }
  return n;
}

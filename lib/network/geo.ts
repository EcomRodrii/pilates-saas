// Distancia "cerca de mí" (brief) — client-side siempre: la posición del
// usuario solo existe en su navegador, así que esto nunca puede ir en el
// Server Component del marketplace (docs/NETWORK-AUDIT-2.md §11, SEO). Es
// una capa de progressive enhancement sobre resultados ya cargados/SSR.

/** Fórmula de Haversine — distancia en km entre dos puntos lat/lng. */
export function distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * (Math.PI / 180);
  const dLng = (b.lng - a.lng) * (Math.PI / 180);
  const lat1 = a.lat * (Math.PI / 180);
  const lat2 = b.lat * (Math.PI / 180);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// La caducidad y la marca de una tarjeta guardada, sin Stripe: las usan el
// panel en el navegador (la ficha de Cobros: «Cobrar con su tarjeta», «Pedirle
// una nueva») y el servidor (`caducidad-tarjeta.ts` las reexporta, y el
// especialista de finanzas avisa de las que caducan antes del próximo cobro).
//
// Sin imports a propósito: `node --test` y el navegador no deben arrastrar el SDK.

// Stripe manda la marca en minúscula (`visa`, `mastercard`) — capitaliza para
// pantalla.
export function nombreDeMarca(marca: string | null | undefined): string {
  if (!marca) return 'Tarjeta';
  if (marca.toLowerCase() === 'visa') return 'Visa';
  return marca.charAt(0).toUpperCase() + marca.slice(1);
}

/**
 * ¿Caduca esta tarjeta en o antes de `fecha`? Una tarjeta con caducidad 09/2026
 * sirve hasta el ÚLTIMO día de septiembre de 2026, no hasta el primero — es el
 * error clásico y aquí se traduciría en avisar a la socia un mes antes de
 * tiempo (o peor, tarde).
 */
export function caducaAntesDe(
  tarjeta: { expMes: number | null; expAnio: number | null },
  fecha: Date,
): boolean {
  const { expMes, expAnio } = tarjeta;
  if (expMes == null || expAnio == null) return false; // sin dato no se afirma nada
  // Primer instante del mes SIGUIENTE al de caducidad = cuando deja de valer.
  const dejaDeValer = new Date(Date.UTC(expAnio, expMes, 1));
  return dejaDeValer.getTime() <= fecha.getTime();
}

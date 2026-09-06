// Cuántas recuperaciones le corresponden a una socia por una semana cerrada.
//
// ⚠️ La pregunta NO es «¿cuántas clases canceló?». Cancelar a tiempo YA le
// libera el hueco de esa semana —`reservar_plaza` no cuenta las canceladas— así
// que si volvió a reservar, no ha perdido nada y no le corresponde ninguna.
// Darle una igualmente sería regalarle una clase por cada cancelación.
//
// Lo que se compensa es el hueco que se quedó SIN USAR habiendo cancelado a
// tiempo: eso es exactamente «cancelé el martes y ya no me cupo otra».
//
// Sin imports: la lógica que decide quién gana qué se prueba sola.
export function derechoDeRecuperaciones(
  limiteSemanal: number,
  usadas: number,
  canceladasATiempo: number,
): number {
  if (limiteSemanal <= 0) return 0;
  const huecosSinUsar = Math.max(0, limiteSemanal - usadas);
  // Nunca más recuperaciones que cancelaciones: si tenía 3 de límite, usó 1 y
  // canceló 1, se quedó con 1 hueco libre por decisión propia y otro por la
  // cancelación. Solo se compensa el segundo.
  return Math.min(huecosSinUsar, Math.max(0, canceladasATiempo));
}

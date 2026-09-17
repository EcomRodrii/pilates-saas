// PAY-6 (auditoría 2026-09-16, decisión del fundador): lógica pura de "¿hay
// que avisar a la socia de que su próxima renovación va a costar más?".
// Separada de `lib/inngest/renovaciones.ts` (que arrastra Supabase) para que
// se pueda probar sin mocks — mismo criterio que el resto de decisiones puras
// del repo (`identidadDemostradaEnCompra`, `sesionDescontada`...).
export function debeAvisarSubidaPrecio(precioAnterior: number | null, precioNuevo: number): boolean {
  // Sin cobro previo (alta muy reciente, primer ciclo) no hay "subida" de la
  // que avisar: es su primer cargo, ya lo vio al contratar.
  if (precioAnterior === null) return false;
  // Solo subidas: una bajada no necesita preaviso, y avisar de ella como si
  // fuera un problema sería un tono raro para una buena noticia.
  return precioNuevo > precioAnterior;
}

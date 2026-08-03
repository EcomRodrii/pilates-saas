// ─────────────────────────────────────────────────────────────────────────────
// Rediseño del Calendario — punto 10: "la rejilla abre desplazada a la hora
// actual". Puro: solo calcula EL PÍXEL al que desplazar, no toca el DOM (eso
// vive en el useEffect del componente, que sí necesita un ref real).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `ahoraMin` null = el día mostrado no es hoy (o no aplica) → no desplazar,
 * abre arriba del todo. Con hoy, deja `margenMin` de contexto por encima de
 * "ahora" en vez de pegar la hora actual al borde superior.
 */
export function calcularScrollInicial(
  ahoraMin: number | null,
  horaInicioMin: number,
  horaFinMin: number,
  pxPorHora: number,
  margenMin: number = 60,
): number {
  if (ahoraMin == null) return 0;
  const alturaTotal = ((horaFinMin - horaInicioMin) / 60) * pxPorHora;
  const objetivo = ((ahoraMin - horaInicioMin - margenMin) / 60) * pxPorHora;
  return Math.max(0, Math.min(objetivo, alturaTotal));
}

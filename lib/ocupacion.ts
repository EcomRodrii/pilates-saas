// ─────────────────────────────────────────────────────────────────────────────
// Semántica ÚNICA de ocupación (I-13).
//
// Antes había tres escalas de color contradictorias (el grid del calendario, la
// barra del sidebar y los puntos del portal). El mismo 75% podía ser ámbar en un
// sitio y verde en otro. Aquí vive el único criterio, por ratio = ocupadas/aforo.
// ─────────────────────────────────────────────────────────────────────────────

export const OCUPACION_COLOR = {
  lleno: '#E23B4E', // 100%+  — completo
  alto: '#E0733E',  // 85%+   — casi lleno
  medio: '#C98A2E', // 60%+   — buen ritmo
  bajo: '#3E9E6B',  // <60%   — disponible
} as const;

// Color por ratio de ocupación (ocupadas / aforo). Acepta >1 (sobreaforo).
export function colorOcupacion(ratio: number): string {
  if (ratio >= 1) return OCUPACION_COLOR.lleno;
  if (ratio >= 0.85) return OCUPACION_COLOR.alto;
  if (ratio >= 0.6) return OCUPACION_COLOR.medio;
  return OCUPACION_COLOR.bajo;
}

// Etiqueta corta coherente con el color (para stats/leyendas).
export function etiquetaOcupacion(ratio: number): string {
  if (ratio >= 1) return 'Completo';
  if (ratio >= 0.85) return 'Casi lleno';
  if (ratio >= 0.6) return 'Buen ritmo';
  return 'Disponible';
}

// Ratio seguro (evita dividir por cero cuando el aforo es 0 o nulo).
export function ratioOcupacion(ocupadas: number, aforo: number | null | undefined): number {
  if (!aforo || aforo <= 0) return ocupadas > 0 ? 1 : 0;
  return ocupadas / aforo;
}

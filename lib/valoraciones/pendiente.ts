// «¿Qué tal la clase?» de Inicio: qué clase puede valorar AHORA. Puro
// (pendiente.test.ts); lo usa `GET /api/public/valorar-clase?pendiente=1`.
// Sin imports ni `@/` (mismo motivo que reglas.ts).
//
// ⚠️ Vive en el SERVIDOR y no en la app a propósito: el catálogo que recibe la
// app (`fetchPublicStudioData`) solo trae las clases que aún no han terminado
// (`fin >= ahora`, I-11), así que la app NUNCA ve la clase a la que acaba de ir.
// Calcularlo allí fue el fallo de la primera versión: la tarjeta no salía.

/** Cuánto dura la oferta de valorar una clase tras terminar. */
export const VENTANA_VALORAR_MS = 24 * 60 * 60 * 1000;

export interface SesionTerminada { id: string; fin: string }

/**
 * La más reciente de las clases terminadas hace menos de 24 h en las que ella
 * ASISTIÓ y que aún no ha valorado, o `null`.
 */
export function elegirClaseParaValorar(
  sesiones: SesionTerminada[], asistidas: ReadonlySet<string>, valoradas: ReadonlySet<string>, ahoraMs: number,
): SesionTerminada | null {
  return sesiones
    .filter((s) => asistidas.has(s.id) && !valoradas.has(s.id))
    .filter((s) => {
      const fin = Date.parse(s.fin);
      return Number.isFinite(fin) && fin <= ahoraMs && ahoraMs - fin < VENTANA_VALORAR_MS;
    })
    .sort((a, b) => Date.parse(b.fin) - Date.parse(a.fin))[0] ?? null;
}

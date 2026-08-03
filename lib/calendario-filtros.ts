// ─────────────────────────────────────────────────────────────────────────────
// Rediseño del Calendario — punto 9: filtro por sala reduce columnas (ya lo
// hace `prepararColumnasSalaDia`/el pre-filtro de sesiones antes de agrupar
// por semana, con el propio salaId); el filtro por instructora NUNCA esconde
// — atenúa, para no perder el contexto del estudio (I-9: antes el filtro
// ocultaba sesiones enteras, ver `filtroInstructor` en el page.tsx viejo).
// Puro: una sola regla, la misma para vista de Día y de Semana.
// ─────────────────────────────────────────────────────────────────────────────

/** '' = sin filtro (nada se atenúa). Una clase sin instructora asignada
 *  también se atenúa con un filtro activo: no es la instructora elegida. */
export function claseAtenuadaPorInstructor(instructorId: string | null, filtroInstructorId: string): boolean {
  if (!filtroInstructorId) return false;
  return instructorId !== filtroInstructorId;
}

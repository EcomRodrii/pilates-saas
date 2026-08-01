// ─────────────────────────────────────────────────────────────────────────────
// Buscador rápido (Fase 2 del calendario) — saltar a una clase por
// instructora/sala/tipo sin navegar semana a semana. Puro: la regla de
// visibilidad por rol (INSTRUCTOR solo ve sus propias clases, igual que
// filtrarSesionesPorRol en lib/calendario-datos.ts) la aplica el LLAMADOR
// sobre `candidatas` antes de pasarlas aquí — este módulo no sabe de roles,
// solo de texto y fechas.
// ─────────────────────────────────────────────────────────────────────────────

export interface SesionBuscable {
  id: string;
  inicio: string;
  cancelada: boolean;
  tipoClaseNombre: string;
  salaNombre: string;
  instructorNombre: string;
}

export function buscarSesiones(candidatas: SesionBuscable[], texto: string, ahora: Date, limite = 8): SesionBuscable[] {
  const q = texto.trim().toLowerCase();
  if (!q) return [];
  const ahoraMs = ahora.getTime();
  return candidatas
    .filter(s => !s.cancelada)
    .filter(s =>
      s.tipoClaseNombre.toLowerCase().includes(q)
      || s.salaNombre.toLowerCase().includes(q)
      || s.instructorNombre.toLowerCase().includes(q))
    .sort((a, b) => Math.abs(new Date(a.inicio).getTime() - ahoraMs) - Math.abs(new Date(b.inicio).getTime() - ahoraMs))
    .slice(0, limite);
}

// Formato de fechas para una experiencia laboral — "2023 — Actualidad" /
// "2023 — 2025". Solo el año: el mockup original nunca pide el mes, y una
// fecha exacta no aporta nada aquí que el año no diga ya.
export function rangoAnios(fechaInicio: string, fechaFin: string | null): string {
  const anioInicio = new Date(fechaInicio).getFullYear();
  if (!fechaFin) return `${anioInicio} — Actualidad`;
  const anioFin = new Date(fechaFin).getFullYear();
  return anioInicio === anioFin ? String(anioInicio) : `${anioInicio} — ${anioFin}`;
}

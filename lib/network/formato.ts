// Formato de fechas para una experiencia laboral — "2023 — Actualidad" /
// "2023 — 2025". Solo el año: el mockup original nunca pide el mes, y una
// fecha exacta no aporta nada aquí que el año no diga ya.
export function rangoAnios(fechaInicio: string, fechaFin: string | null): string {
  const anioInicio = new Date(fechaInicio).getFullYear();
  if (!fechaFin) return `${anioInicio} — Actualidad`;
  const anioFin = new Date(fechaFin).getFullYear();
  return anioInicio === anioFin ? String(anioInicio) : `${anioInicio} — ${anioFin}`;
}

/**
 * `instagram`/`linkedin`/`web` (paso "Tu perfil" del wizard,
 * app/network/crear-perfil/pasos/paso-perfil.tsx) son texto libre sin
 * normalizar al guardarse — "ana.pilates", "@ana.pilates" o una URL
 * completa son igual de válidos ahí, y hasta ahora NINGUNA pantalla los
 * enlazaba (auditoría 2026-08-31: se guardaban, se mapeaban, nunca se
 * pintaban). Para poder enlazarlos de verdad en el perfil público sin
 * pedir que la instructora vuelva a rellenar el campo con un formato
 * concreto: si ya parece una URL, se respeta tal cual; si no, se trata
 * como un usuario/handle y se construye la URL del dominio correspondiente.
 */
export function hrefDeRedSocial(valor: string, dominio: 'instagram.com' | 'linkedin.com'): string {
  const limpio = valor.trim();
  if (/^https?:\/\//i.test(limpio)) return limpio;
  if (limpio.includes(dominio)) return `https://${limpio.replace(/^\/+/, '')}`;
  const handle = limpio.replace(/^@/, '').replace(/^\/+|\/+$/g, '');
  return dominio === 'linkedin.com' ? `https://linkedin.com/in/${handle}` : `https://instagram.com/${handle}`;
}

/** Mismo criterio que `hrefDeRedSocial`: `web` es texto libre, puede llegar sin protocolo. */
export function hrefDeWeb(valor: string): string {
  const limpio = valor.trim();
  return /^https?:\/\//i.test(limpio) ? limpio : `https://${limpio.replace(/^\/+/, '')}`;
}

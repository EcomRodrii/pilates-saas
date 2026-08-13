// Slugs legibles para URLs de perfil público (/network/instructoras/[slug]).
// Puro y testeable — la generación real (comprobar colisión contra la BD)
// vive en el endpoint que publica, no aquí.

export function normalizarSlug(texto: string): string {
  return texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Base del slug antes de resolver colisiones: "María García" + "Barcelona" → "maria-garcia-barcelona". */
export function slugBase(nombre: string, ciudad: string | null): string {
  const partes = [nombre, ciudad].filter((v): v is string => Boolean(v && v.trim())).join('-');
  return normalizarSlug(partes) || 'instructora';
}

/** Candidato N-ésimo cuando el base ya está en uso: "maria-garcia-barcelona-2". */
export function slugConSufijo(base: string, sufijo: number): string {
  return sufijo <= 1 ? base : `${base}-${sufijo}`;
}

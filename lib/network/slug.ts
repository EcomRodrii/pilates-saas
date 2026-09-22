// Slugs legibles para URLs de perfil público (/network/instructoras/[slug]).
// Puro y testeable — la generación real (comprobar colisión contra la BD)
// vive en el endpoint que publica, no aquí.

// Auditoría 2026-09-22 (F-11): este cuerpo era idéntico carácter a carácter al
// de `lib/slug.ts`. Dos copias de la función que decide cómo se ve una URL, en
// los dos espacios de direcciones del producto (`/[slug]` del estudio y
// `/network/instructoras/[slug]`): el día que una divergiera, dos perfiles con
// el mismo nombre resolverían a slugs distintos según quién los generara.
// Se reexporta para no cambiar los imports de quien ya la usaba desde aquí.
export { normalizarSlug } from '../slug.ts';
import { normalizarSlug } from '../slug.ts';

/** Base del slug antes de resolver colisiones: "María García" + "Barcelona" → "maria-garcia-barcelona". */
export function slugBase(nombre: string, ciudad: string | null): string {
  const partes = [nombre, ciudad].filter((v): v is string => Boolean(v && v.trim())).join('-');
  return normalizarSlug(partes) || 'instructora';
}

/** Candidato N-ésimo cuando el base ya está en uso: "maria-garcia-barcelona-2". */
export function slugConSufijo(base: string, sufijo: number): string {
  return sufijo <= 1 ? base : `${base}-${sufijo}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// La dirección pública de un estudio (`/reservar/mi-estudio`).
//
// Puro y sin dependencias, para poder probarlo: el servidor valida lo que llega
// y la pantalla enseña el mismo aviso mientras se escribe. Si las dos reglas no
// son literalmente la misma función, la dueña escribe algo que parece válido y
// el servidor se lo rechaza al guardar.
// ─────────────────────────────────────────────────────────────────────────────

/** Longitud mínima: menos de 3 no identifica nada y se agota enseguida. */
export const SLUG_MIN = 3;
/** Longitud máxima: es una URL que la gente teclea y comparte. */
export const SLUG_MAX = 40;

// Rutas propias de la app: si un estudio cogiera una de estas, su portal
// chocaría con una página del producto y ganaría la del producto.
export const RESERVADAS = new Set([
  'api', 'app', 'admin', 'interno', 'login', 'logout', 'registro', 'reservar',
  'portal', 'kiosk', 'dashboard', 'configuracion', 'legal', 'privacidad',
  'terminos', 'cookies', 'soporte', 'ayuda', 'blog', 'precios', 'www', 'static',
  '_next', 'crear-estudio', 'migracion', 'valorar', 'suscripcion',
]);

/**
 * Lleva lo escrito a la forma de una dirección: sin acentos, sin mayúsculas y
 * sin nada que no sea letra, número o guion.
 *
 * Se normaliza en vez de rechazar porque quien escribe "Pilates Málaga" no está
 * cometiendo un error: está escribiendo el nombre de su estudio.
 */
export function normalizarSlug(texto: string): string {
  return texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * El motivo por el que esta dirección no vale, en algo que una persona pueda
 * leer y arreglar. `null` si vale.
 *
 * Devuelve el MOTIVO y no un booleano a propósito: "no es válida" no le dice a
 * nadie qué cambiar.
 */
export function motivoSlugInvalido(slug: string): string | null {
  if (!slug) return 'Escribe una dirección para tu estudio.';
  if (slug.length < SLUG_MIN) return `La dirección necesita al menos ${SLUG_MIN} letras.`;
  if (slug.length > SLUG_MAX) return `La dirección no puede pasar de ${SLUG_MAX} letras.`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return 'Solo letras, números y guiones (sin espacios ni acentos).';
  }
  if (RESERVADAS.has(slug)) {
    return 'Esa palabra la usa la aplicación. Elige otra.';
  }
  return null;
}

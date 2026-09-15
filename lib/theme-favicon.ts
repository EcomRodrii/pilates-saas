// De dónde puede salir el favicon de un estudio.
//
// El favicon se pinta en la página PÚBLICA de reservas (`app/reservar/[slug]`),
// así que el navegador de cada visitante lo pide allí donde apunte. Antes valía
// cualquier cadena con forma de URL: otro dominio, `http:` (contenido mixto, no
// se pinta) o esquemas que no son una imagen, y sin tope de longitud.
//
// Dos niveles, porque el esquema del tema no sabe de qué estudio es:
//   · `faviconConFormaValida` — sin contexto: https, sin credenciales, acotada.
//     Lo aplica el esquema zod (escritura Y lectura con `resolveTheme`).
//   · `esFaviconDelEstudio` — con contexto: además, un fichero de NUESTRO
//     Storage y de ESTE estudio. Lo aplica `lib/theme-data.ts` al escribir y al
//     leer, de modo que un valor viejo que no cumpla se ignora sin romper nada.
//
// Medido en producción (2026-09-15) antes de cerrarlo: todos los favicons
// guardados ya son uno de estos tres ficheros del propio estudio — el subido
// (`favicon-`), el de borrador (`favicon-borrador-`) o el logo, que el
// asistente de bienvenida pone como favicon (`logo-`).
//
// Pura y sin imports: la ejecuta `node --test` directamente.

/** Tope de longitud. Las URLs reales rondan los 120 caracteres. */
export const FAVICON_URL_MAX = 512;

const BUCKET = 'avatars';
const PREFIJOS_DEL_ESTUDIO = ['favicon', 'favicon-borrador', 'logo'] as const;

function parsear(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** https, sin usuario/contraseña embebidos y dentro del tope. */
export function faviconConFormaValida(url: string): boolean {
  if (url.length > FAVICON_URL_MAX) return false;
  const u = parsear(url);
  return !!u && u.protocol === 'https:' && !u.username && !u.password;
}

/**
 * ¿Es uno de los ficheros de marca de ESTE estudio en el bucket público de
 * nuestro Supabase? Se compara el ORIGEN entero (esquema, host y puerto) y la
 * ruta exacta, no un prefijo de texto: `https://<nuestro-host>.otro.com/…` o
 * `…/favicon-<id>-otra-cosa` no pasan. La query (`?v=…`, el cache-bust de la
 * subida) se admite.
 */
export function esFaviconDelEstudio(
  url: string,
  studioId: string,
  baseSupabase: string | null | undefined,
): boolean {
  if (!studioId || !faviconConFormaValida(url)) return false;
  const base = parsear((baseSupabase ?? '').trim());
  const u = parsear(url);
  if (!base || !u || u.origin !== base.origin || u.hash) return false;
  return PREFIJOS_DEL_ESTUDIO.some(
    (prefijo) => u.pathname === `/storage/v1/object/public/${BUCKET}/${prefijo}-${studioId}`,
  );
}

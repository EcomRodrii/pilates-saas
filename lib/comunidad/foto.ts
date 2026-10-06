// La foto de una publicación del tablón: de su URL pública a su ruta en el bucket.
//
// El bucket `comunidad-media` es PÚBLICO (decisión SEC-05): quien tenga la URL ve
// la foto. Por eso borrar una publicación tiene que borrar también su foto, y el
// servidor necesita saber, a partir de `imagen_url`, QUÉ objeto borrar. La clave
// no se puede sacar del id del post: la sube el panel con su propio nombre
// (`post-<hora>`, lib/portal-storage.ts) antes de que exista la fila, y el
// servidor le da otro id al guardarla.
//
// Puro, sin `@/`: se prueba con `node --test`.

export const BUCKET_COMUNIDAD = 'comunidad-media';

/** `https://<proyecto>.supabase.co/storage/v1/object/public/comunidad-media/` — lo que produce `getPublicUrl`. */
export function prefijoFotoComunidad(supabaseUrl: string | null | undefined): string | null {
  const base = (supabaseUrl ?? '').replace(/\/+$/, '');
  return base ? `${base}/storage/v1/object/public/${BUCKET_COMUNIDAD}/` : null;
}

/**
 * La ruta dentro del bucket (`<studioId>/<fichero>`) de una foto de ESTE
 * estudio, o `null` si la URL no es una foto suya de `comunidad-media` en este
 * proyecto (otro estudio, otro bucket, otro dominio, una ruta con `..`).
 * Con `null` no se borra nada: nunca se adivina qué objeto quitar.
 */
export function rutaFotoComunidad(
  imagenUrl: string | null | undefined, studioId: string, supabaseUrl: string | null | undefined,
): string | null {
  if (!imagenUrl || !studioId) return null;
  const prefijo = prefijoFotoComunidad(supabaseUrl);
  if (!prefijo || !imagenUrl.startsWith(prefijo)) return null;
  const codificada = imagenUrl.slice(prefijo.length).split(/[?#]/)[0];
  let ruta: string;
  try {
    ruta = decodeURIComponent(codificada);
  } catch {
    return null;
  }
  if (ruta.includes('\\')) return null;
  const partes = ruta.split('/');
  // La primera carpeta es el estudio (la exige la política del bucket al subir).
  if (partes.length < 2 || partes[0] !== studioId) return null;
  if (partes.some((p) => p === '' || p === '.' || p === '..')) return null;
  return ruta;
}

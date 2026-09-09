// Los límites de una foto de perfil, en UN solo sitio.
//
// Sin imports ni `@/`: lo comparten el navegador (que valida antes de subir
// para no hacer viajar 5 MB en balde) y la ruta de servidor (que valida otra
// vez porque la del navegador es trivialmente saltable). Dos listas distintas
// serían dos criterios que divergen, y el rechazo llegaría del bucket con un
// mensaje que no dice nada.
//
// Los tipos son los que el bucket `avatars` declara en `allowed_mime_types`
// para fotos, y el tamaño es su `file_size_limit`.

export const TIPOS_FOTO_PERFIL = ['image/jpeg', 'image/png', 'image/webp'];
export const FOTO_PERFIL_MAX_BYTES = 5 * 1024 * 1024;

/**
 * El motivo por el que una imagen no vale, o `null` si vale.
 *
 * `bytes` admite `null` para comprobar SOLO el formato: es lo que necesita el
 * navegador ANTES de redimensionar, donde el tamaño del original no importa
 * (una foto de móvil de 12 MB acaba en ~100 KB después de reducirla, y
 * rechazarla antes dejaba a la alumna sin poder poner su foto). El tamaño se
 * comprueba después, sobre el fichero que de verdad se sube, y otra vez en el
 * servidor.
 */
export function motivoFotoInvalida(tipo: string, bytes: number | null): string | null {
  if (!TIPOS_FOTO_PERFIL.includes(tipo)) return 'Ese formato de imagen no vale. Usa JPG, PNG o WebP.';
  if (bytes !== null && bytes > FOTO_PERFIL_MAX_BYTES) return 'La imagen no puede superar 5 MB.';
  return null;
}

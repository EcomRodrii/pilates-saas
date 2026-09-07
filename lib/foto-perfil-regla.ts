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

/** El motivo por el que una imagen no vale, o `null` si vale. */
export function motivoFotoInvalida(tipo: string, bytes: number): string | null {
  if (!TIPOS_FOTO_PERFIL.includes(tipo)) return 'Ese formato de imagen no vale. Usa JPG, PNG o WebP.';
  if (bytes > FOTO_PERFIL_MAX_BYTES) return 'La imagen no puede superar 5 MB.';
  return null;
}

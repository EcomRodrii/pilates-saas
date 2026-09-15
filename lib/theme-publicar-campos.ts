// Publicar CAMPOS SUELTOS del tema —el color, el favicon— sin publicar el
// borrador entero.
//
// Configuración › Marca guarda al momento, pero publicar solo sabía copiar TODO
// el borrador a lo publicado, y ese borrador puede llevar cambios a medias del
// editor del portal (en mantenimiento). De ahí dos bugs:
//   · el favicon se quedaba en el borrador y no llegaba nunca a publicarse;
//   · guardar el color reescribía el borrador entero desde lo publicado, y el
//     favicon pendiente desaparecía.
// Aquí se publica lo que se ha tocado, encima de lo publicado, y se deja ese
// mismo cambio en el borrador sin tocar nada más de él.
//
// Pura y sin imports: la ejecuta `node --test` directamente.

/** Lo que Marca puede publicar suelto. El resto sigue pasando por el editor. */
export const CAMPOS_PUBLICABLES = ['primary', 'secondary', 'faviconUrl'] as const;

export type CamposPublicables = Partial<{ primary: string; secondary: string; faviconUrl: string | null }>;

/**
 * Lo publicado y el borrador con SOLO `campos` cambiados. Lo que el borrador
 * tuviera de más (un favicon pendiente, cambios del editor) sigue en él y no
 * sale a lo publicado.
 */
export function fusionarCampos<T extends object>(
  publicado: T,
  borrador: T,
  campos: Partial<T>,
): { publicado: T; borrador: T } {
  return { publicado: { ...publicado, ...campos }, borrador: { ...borrador, ...campos } };
}

/**
 * ¿Es el favicon subido al path de BORRADOR de este estudio
 * (`favicon-borrador-<studioId>`)? Solo entonces hay que copiar el archivo al
 * path publicado. Un enlace pegado, o el favicon ya publicado, se publica tal
 * cual: copiar el borrador en su lugar sacaría un archivo viejo.
 */
export function esFaviconDeBorrador(url: string, studioId: string): boolean {
  try {
    return new URL(url).pathname.endsWith(`/favicon-borrador-${studioId}`);
  } catch {
    return false;
  }
}

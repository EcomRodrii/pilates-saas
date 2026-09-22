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
// Pura y sin imports de runtime (el de tipos se borra al compilar): la ejecuta
// `node --test` directamente.

import type { AppAlumna } from './theme-schema.ts';

/** Lo que se puede publicar suelto, sin el borrador: el color y el favicon (Marca) y la apariencia de la app. */
export const CAMPOS_PUBLICABLES = ['primary', 'secondary', 'faviconUrl', 'appAlumna'] as const;

export type CamposPublicables = Partial<{ primary: string; secondary: string; faviconUrl: string | null; appAlumna: AppAlumna }>;

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
 * Lo validado, pero SOLO con las claves que venían en el cuerpo.
 *
 * ⚠️ Zod 4 aplica los `.default()` también dentro de `.partial()`: validar
 * `{ primary, secondary }` con el esquema del tema devuelve además
 * `faviconUrl: null` y el resto de valores de fábrica. Así, publicar solo los
 * colores QUITABA el favicon, y un borrador parcial devolvía a su valor por
 * defecto todo lo que no traía.
 */
export function soloLoEnviado<T extends object>(crudo: unknown, validado: T): Partial<T> {
  if (!crudo || typeof crudo !== 'object') return {};
  return Object.fromEntries(
    Object.entries(validado).filter(([clave]) => Object.prototype.hasOwnProperty.call(crudo, clave)),
  ) as Partial<T>;
}

/**
 * El `actualizado_en` que se escribe al guardar el tema. Es también la VERSIÓN
 * con la que `lib/theme-data.ts` comprueba que nadie ha escrito entre su lectura
 * y su escritura, así que tiene que salir ESTRICTAMENTE mayor que la leída
 * aunque el reloj de esta instancia vaya por detrás del de la que escribió
 * antes: si saliera igual, la escritura de otra pestaña pasaría la comprobación
 * y volvería a perderse en silencio. Postgres guarda microsegundos; el
 * milisegundo siguiente sigue siendo mayor.
 */
export function siguienteVersionTheme(anterior: string | null, ahora: number = Date.now()): string {
  const previa = anterior ? Date.parse(anterior) : NaN;
  return new Date(Number.isNaN(previa) ? ahora : Math.max(ahora, previa + 1)).toISOString();
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

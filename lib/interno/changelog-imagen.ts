// La captura que acompaña a un cambio del changelog.
//
// Módulo aparte y SIN imports para que `node --test` pueda probar la
// validación: es la única pieza de esto que puede estar mal de una forma que no
// se ve mirando la pantalla. Y de hecho lo estuvo — ver abajo.

export const BUCKET_CHANGELOG = 'changelog-media';
export const MAX_BYTES_IMAGEN_CAMBIO = 2 * 1024 * 1024; // 2 MB, el límite del bucket
export const TIPOS_IMAGEN_CAMBIO = ['image/png', 'image/jpeg', 'image/webp'];

/** El único prefijo que vale, construido desde la URL del proyecto Supabase. */
export function prefijoPublicoChangelog(urlSupabase: string): string {
  return `${urlSupabase.replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET_CHANGELOG}/`;
}

/**
 * ¿Es una URL que podemos pintar en el panel de un estudio?
 *
 * Esto acaba en un `<img src>` servido a TODOS los estudios. Una URL a un
 * dominio ajeno convertiría cada apertura del changelog en una baliza que le
 * cuenta a un tercero quién lo lee y desde dónde, y dejaría la imagen a merced
 * de que ese tercero la cambie cuando quiera.
 *
 * ⚠️ **Comprobar solo que el path contenga `/changelog-media/` NO sirve**, y la
 * primera versión de esto hacía justo eso: `https://ejemplo.com/changelog-media/x.png`
 * pasaba el filtro, porque el path lo pone quien sirve el dominio. Lo cazó su
 * propio test antes de salir. Se exige el PREFIJO COMPLETO —origen incluido—,
 * que además clava de paso el `https` y la ruta pública del bucket.
 *
 * `null`/vacío es válido: la mayoría de los cambios no tienen nada que enseñar.
 */
export function urlImagenCambioValida(url: string | null | undefined, urlSupabase: string): boolean {
  const v = (url ?? '').trim();
  if (v === '') return true;
  if (!urlSupabase) return false; // sin saber cuál es nuestro origen no se aprueba nada
  return v.startsWith(prefijoPublicoChangelog(urlSupabase));
}

/** El valor que se guarda: vacío se normaliza a `null`, nunca a `''`. */
export function normalizarUrlImagenCambio(url: string | null | undefined): string | null {
  const v = (url ?? '').trim();
  return v === '' ? null : v;
}

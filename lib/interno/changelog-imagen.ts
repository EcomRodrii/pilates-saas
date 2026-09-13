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

/**
 * M-4 (auditoría 58ª pasada). La ruta de subida solo comprobaba `file.type`
 * —lo que el NAVEGADOR dice que es el fichero, no lo que de verdad hay
 * dentro— antes de decidir la extensión y el `contentType` con el que se
 * guarda. Mitigado por otras capas (exige `content.write`, el bucket no
 * acepta ningún tipo fuera de esta lista), pero "mitigado" no es "cerrado":
 * esto mira los primeros bytes de verdad.
 *
 * `null` = no es ninguno de los tres formatos que este endpoint admite.
 */
export function tipoRealDeBytes(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (bytes.length >= 8
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47
      && bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return 'image/jpeg';
  }
  // WEBP: contenedor RIFF ("RIFF" + tamaño de 4 bytes + "WEBP").
  if (bytes.length >= 12
      && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp';
  }
  return null;
}

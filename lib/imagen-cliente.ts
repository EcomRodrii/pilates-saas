// Redimensionado de imágenes EN EL NAVEGADOR, antes de subirlas a Storage.
//
// POR QUÉ
// El bucket `avatars` tenía 12 MB, y 10,3 de ellos eran cuatro PNG de 3,1 / 2,9
// / 2,3 / 2,0 MB. No había ningún resize en ningún camino de subida: la foto
// salía del móvil a 12 megapíxeles y se guardaba tal cual, para luego pintarse
// recortada en un círculo de 40 px. Cada pintado de esa foto es egress de
// Storage pagado.
//
// Se hace en cliente y no en servidor a propósito: así el byte gordo no llega a
// viajar, y no hace falta meter `sharp` (nativo, pesado) en el bundle de
// funciones de Vercel.
//
// REGLA DE ORO: esto NUNCA puede romper una subida. Ante cualquier duda —
// formato que no toca, navegador sin soporte, error de canvas, resultado que no
// mejora— se devuelve el fichero ORIGINAL y la subida sigue como siempre.

/** Lado máximo para fotos que se muestran recortadas en círculo (avatares). */
export const LADO_AVATAR = 512;
/** Lado máximo para la foto de un tipo de clase (se pinta como tarjeta). */
export const LADO_FOTO_CLASE = 1280;
/** Lado máximo para un banner del portal (se pinta a ancho completo). */
export const LADO_BANNER = 1600;

/** Por debajo de esto no merece la pena re-codificar: se perdería calidad a cambio de nada. */
const YA_ES_PEQUENA_BYTES = 150 * 1024;

const CALIDAD_WEBP = 0.85;

/**
 * ¿Este tipo MIME se puede pasar por canvas sin estropearlo?
 *
 * Separado y exportado porque es la parte crítica para la seguridad del cambio
 * y es la única que se puede probar sin navegador: el resto necesita canvas.
 *
 *  · SVG  → rasterizarlo pierde el vector. El logo del estudio puede ser SVG.
 *  · GIF  → pasarlo por canvas mata la animación y deja el primer fotograma,
 *           sin error y sin avisar.
 */
export function debeIntentarReducir(tipoMime: string): boolean {
  if (!tipoMime.startsWith('image/')) return false;
  return tipoMime !== 'image/svg+xml' && tipoMime !== 'image/gif';
}

/**
 * Devuelve una versión reducida de `file`, o el propio `file` si no procede
 * tocarlo. Solo tiene efecto en el navegador.
 *
 * ⚠️ Safari: `canvas.toBlob` con 'image/webp' no está soportado en todas las
 * versiones. La especificación obliga a caer a PNG en ese caso, así que el
 * resultado sigue siendo válido (y sigue siendo mucho más pequeño que el
 * original, porque lo que más pesa es el número de píxeles, no el códec). Por
 * eso el `contentType` se toma de `blob.type` y no se asume 'image/webp' — la
 * suite e2e solo corre en Chromium y no vería esta diferencia.
 */
export async function redimensionarImagen(file: File, ladoMaximo: number): Promise<File> {
  if (!debeIntentarReducir(file.type)) return file;
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return file;

  let bitmap: ImageBitmap | null = null;
  try {
    // `imageOrientation: 'from-image'` NO es opcional aquí.
    //
    // Una foto de móvil casi nunca está guardada "de pie": el sensor graba en
    // horizontal y añade una etiqueta EXIF de orientación que el visor aplica al
    // pintarla. Al pasarla por canvas se pierde esa etiqueta — el resultado se
    // guarda con los píxeles tal cual salieron del sensor, ya sin nada que diga
    // cómo hay que girarlos. O sea: un retrato subido desde el móvil podía
    // quedarse TUMBADO para siempre.
    //
    // El valor por defecto de esta opción ha ido cambiando en la especificación
    // y no es el mismo en todos los navegadores, así que dejarlo implícito era
    // confiar en que a todo el mundo le tocara el bueno. Pedido explícitamente,
    // `createImageBitmap` aplica la rotación ANTES de que dibujemos, y lo que se
    // sube ya está derecho sin depender de ninguna etiqueta.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));

    // Ya cabe en el lado máximo y además no pesa: dejarla como está.
    if (escala === 1 && file.size <= YA_ES_PEQUENA_BYTES) return file;

    const ancho = Math.max(1, Math.round(bitmap.width * escala));
    const alto = Math.max(1, Math.round(bitmap.height * escala));

    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, ancho, alto);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', CALIDAD_WEBP);
    });

    // Si no hay blob, o el resultado NO mejora (puede pasar con imágenes ya
    // muy optimizadas o muy pequeñas), se queda el original. Nunca empeoramos.
    if (!blob || blob.size >= file.size) return file;

    const extension = blob.type === 'image/webp' ? 'webp' : 'png';
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.${extension}`, {
      type: blob.type,
      lastModified: Date.now(),
    });
  } catch {
    // Cualquier fallo (formato raro, imagen corrupta, navegador sin soporte):
    // la subida sigue con el fichero original.
    return file;
  } finally {
    bitmap?.close();
  }
}

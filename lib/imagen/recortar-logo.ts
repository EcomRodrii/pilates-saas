import { calcularCajaOpaca, mereceRecorte } from '@/lib/imagen/recorte-alfa';

// Envoltorio de navegador del recorte: File -> File. La decisión de dónde está
// el dibujo vive en recorte-alfa.ts, que es puro y sí tiene tests; aquí solo
// está la fontanería del canvas, que no se puede probar sin navegador.

/** Solo formatos ráster con canal alfa. Un SVG ya viene ceñido por su viewBox y
 *  rasterizarlo sería un paso atrás; un JPG no tiene transparencia que sobre. */
const RECORTABLES = ['image/png', 'image/webp'];

/**
 * Devuelve el logo sin el aire transparente de alrededor. Si no hay nada que
 * recortar, si el formato no lo admite, o si algo falla, devuelve el fichero
 * ORIGINAL: esto es una mejora oportunista dentro de una subida, y una subida
 * que falla porque el recorte no pudo con la imagen sería mucho peor que un
 * logo con margen.
 */
export async function recortarTransparencia(file: File): Promise<File> {
  if (!RECORTABLES.includes(file.type) || typeof document === 'undefined') return file;

  const url = URL.createObjectURL(file);
  try {
    const img = await cargar(url);
    const { naturalWidth: ancho, naturalHeight: alto } = img;
    if (!ancho || !alto) return file;

    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0);

    const caja = calcularCajaOpaca(ctx.getImageData(0, 0, ancho, alto).data, ancho, alto);
    if (!mereceRecorte(caja, ancho, alto) || !caja) return file;

    const recorte = document.createElement('canvas');
    recorte.width = caja.ancho;
    recorte.height = caja.alto;
    recorte.getContext('2d')?.drawImage(
      lienzo, caja.x, caja.y, caja.ancho, caja.alto, 0, 0, caja.ancho, caja.alto,
    );

    // Siempre PNG: es el único de los dos que no arriesga nada al recodificar,
    // y hay que conservar la transparencia sí o sí.
    const blob = await new Promise<Blob | null>(res => recorte.toBlob(res, 'image/png'));
    if (!blob) return file;

    const nombre = file.name.replace(/\.[^.]+$/, '') + '.png';
    return new File([blob], nombre, { type: 'image/png' });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function cargar(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('no se pudo leer la imagen'));
    img.src = url;
  });
}

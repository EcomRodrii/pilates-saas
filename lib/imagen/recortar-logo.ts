import {
  calcularCajaOpaca, encajeCentrado, fondoLiso, mereceRecorte, tintaClara,
  FONDO_ICONO, FONDO_ICONO_OSCURO, LADO_ICONO, UMBRAL_ALFA,
  type CajaOpaca, type Rgb,
} from '@/lib/imagen/recorte-alfa';

// Envoltorio de navegador del recorte: File -> File. Las decisiones (dónde está
// el dibujo, cuál es el fondo, cómo se encaja) viven en recorte-alfa.ts, que es
// puro y tiene tests; aquí solo está la fontanería del canvas, que no se puede
// probar sin navegador.
//
// Las dos funciones son una mejora OPORTUNISTA dentro de una subida: si algo
// falla devuelven el fichero original. Una subida que falla porque el recorte
// no pudo con la imagen sería mucho peor que un logo con margen.

/** Formatos ráster que el navegador decodifica. Un SVG ya viene ceñido por su
 *  viewBox y rasterizarlo sería un paso atrás. */
const PROCESABLES = ['image/png', 'image/webp', 'image/jpeg'];

interface Leida {
  lienzo: HTMLCanvasElement;
  caja: CajaOpaca | null;
  fondo: Rgb | null;
  claro: boolean;
}

async function leer(file: File): Promise<Leida | null> {
  if (!PROCESABLES.includes(file.type) || typeof document === 'undefined') return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await cargar(url);
    const { naturalWidth: ancho, naturalHeight: alto } = img;
    if (!ancho || !alto) return null;
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, ancho, alto).data;
    const fondo = fondoLiso(px, ancho, alto);
    return {
      lienzo,
      caja: calcularCajaOpaca(px, ancho, alto, UMBRAL_ALFA, fondo),
      fondo,
      claro: tintaClara(px, ancho, alto, fondo),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * El logo sin el aire de alrededor, sea transparente o de un fondo liso (un
 * logo exportado en crema o en blanco). Sin nada que recortar, el original.
 */
export async function recortarMargenes(file: File): Promise<File> {
  try {
    const l = await leer(file);
    if (!l?.caja || !mereceRecorte(l.caja, l.lienzo.width, l.lienzo.height)) return file;
    const { caja } = l;
    const recorte = document.createElement('canvas');
    recorte.width = caja.ancho;
    recorte.height = caja.alto;
    recorte.getContext('2d')?.drawImage(l.lienzo, caja.x, caja.y, caja.ancho, caja.alto, 0, 0, caja.ancho, caja.alto);
    return (await comoPng(recorte, file.name)) ?? file;
  } catch {
    return file;
  }
}

/**
 * El icono del estudio (su favicon), preparado para verse pequeño: el símbolo
 * sin márgenes propios, centrado en un cuadrado de `LADO_ICONO` y ocupando el
 * 84 %, sobre blanco. Así una imagen de 1254 px con la figura flotando en la
 * mitad del lienzo no se convierte en una mancha a 16 px.
 *
 * Si el símbolo es tan claro que en blanco desaparecería (un logo blanco sobre
 * transparente), va sobre su propio fondo si tenía uno liso, o sobre oscuro.
 */
export async function prepararIconoMarca(file: File): Promise<File> {
  try {
    const l = await leer(file);
    if (!l?.caja) return file;
    const { caja } = l;

    // El símbolo aislado, a su tamaño.
    let origen = document.createElement('canvas');
    origen.width = caja.ancho;
    origen.height = caja.alto;
    origen.getContext('2d')?.drawImage(l.lienzo, caja.x, caja.y, caja.ancho, caja.alto, 0, 0, caja.ancho, caja.alto);

    const destino = encajeCentrado(caja.ancho, caja.alto, LADO_ICONO);
    // Reducir de golpe de 1254 a 430 px deja dientes en un trazo fino. A mitades
    // sucesivas el suavizado del canvas promedia bien.
    while (origen.width / 2 >= destino.ancho && origen.height / 2 >= destino.alto) {
      const mitad = document.createElement('canvas');
      mitad.width = Math.round(origen.width / 2);
      mitad.height = Math.round(origen.height / 2);
      const c = mitad.getContext('2d');
      if (!c) break;
      c.imageSmoothingQuality = 'high';
      c.drawImage(origen, 0, 0, mitad.width, mitad.height);
      origen = mitad;
    }

    const icono = document.createElement('canvas');
    icono.width = LADO_ICONO;
    icono.height = LADO_ICONO;
    const ctx = icono.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = l.claro ? (l.fondo ? rgbAHex(l.fondo) : FONDO_ICONO_OSCURO) : FONDO_ICONO;
    ctx.fillRect(0, 0, LADO_ICONO, LADO_ICONO);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(origen, destino.x, destino.y, destino.ancho, destino.alto);
    return (await comoPng(icono, file.name)) ?? file;
  } catch {
    return file;
  }
}

function rgbAHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Siempre PNG: no pierde nada al recodificar y conserva la transparencia. */
async function comoPng(lienzo: HTMLCanvasElement, nombreOriginal: string): Promise<File | null> {
  const blob = await new Promise<Blob | null>(res => lienzo.toBlob(res, 'image/png'));
  if (!blob) return null;
  return new File([blob], nombreOriginal.replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' });
}

function cargar(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('no se pudo leer la imagen'));
    img.src = url;
  });
}

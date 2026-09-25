import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Facturación con Veri*Factu para estudios de Pilates — Tentare';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Cada cobro, su factura. Sin que tengas que saber cómo.', 'Numeración correlativa, huella encadenada y cierre anual para tu gestoría.');
}

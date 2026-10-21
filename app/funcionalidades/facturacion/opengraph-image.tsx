import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Facturación para estudios de Pilates y yoga — Tentare';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Cada cobro, su factura.', 'Numeración correlativa, rectificativas y cierre anual para tu gestoría.');
}

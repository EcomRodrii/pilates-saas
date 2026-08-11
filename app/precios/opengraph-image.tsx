import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Precios de Tentare — Software para estudios de Pilates';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Precio público. Sin permanencia.', 'Base 29€, Estudio 59€ y Cadena 149€ al mes, con prueba de 14 días.');
}

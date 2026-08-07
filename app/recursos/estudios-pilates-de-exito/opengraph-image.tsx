import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Qué puedes aprender de los estudios de pilates que más crecen';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Qué aprender de los estudios de pilates que más crecen', 'Datos reales de Club Pilates, SLT, BASI y el mercado español.');
}

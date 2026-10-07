import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Sobre Tentare — software para estudios de Pilates y yoga';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Sobre Tentare.', 'Software de gestión para estudios de Pilates y yoga, hecho en España.');
}

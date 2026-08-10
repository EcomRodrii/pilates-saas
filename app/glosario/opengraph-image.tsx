import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Glosario del software de gestión para estudios de Pilates';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Glosario del software de gestión para Pilates', 'Definiciones claras y neutrales de los términos del sector.');
}

import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Cómo instalar reservas en tu web: WordPress, Wix y Squarespace paso a paso';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Cómo instalar reservas en tu web', 'WordPress, Wix y Squarespace, paso a paso.');
}

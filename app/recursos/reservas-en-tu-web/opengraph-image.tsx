import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Por qué mandar a la alumna a otra web te cuesta reservas';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Por qué mandar a la alumna a otra web te cuesta reservas', 'Y qué hacer en su lugar: widget, plugin o API.');
}

import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Tentare vs bsport';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Tentare vs bsport.', 'Precio, permanencia, Veri*factu y sustitución de instructoras — comparados punto por punto.');
}

import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Tentare vs Flowstark';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Tentare vs Flowstark.', 'Precio, permanencia, Veri*factu, reformer individual y sustitución de instructoras — comparados punto por punto.');
}

import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Tentare vs Momence';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Tentare vs Momence.', 'Precio real con comisiones, Veri*factu y dónde viven tus datos — comparados punto por punto.');
}

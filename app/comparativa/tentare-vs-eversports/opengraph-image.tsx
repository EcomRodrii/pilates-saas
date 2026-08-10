import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Tentare vs Eversports';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Tentare vs Eversports.', 'Precio, permanencia, Veri*factu y comisión por captar clientas — comparados punto por punto.');
}

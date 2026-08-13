import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Cambiarte a Tentare desde otro software';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Cambiarte a Tentare, sin perder nada.', 'Migración revisada antes de tocar nada, y reversible con un clic. Lo haces tú o te lo hacemos nosotros en 48h.');
}

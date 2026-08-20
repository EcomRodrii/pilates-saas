import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Glofox vs. Tentare: cuál conviene a tu estudio de Pilates';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Glofox vs. Tentare', 'Cuál conviene a tu estudio de Pilates — sin folletos de marketing.');
}

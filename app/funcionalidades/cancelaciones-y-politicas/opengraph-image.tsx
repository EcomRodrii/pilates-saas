import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Política de cancelación y no-shows para tu estudio — Tentare';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('La plaza vacía de las 19:00.', 'Ventana de cancelación, devolución de bono y penalización opcional.');
}

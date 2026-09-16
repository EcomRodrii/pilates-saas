import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Clases recurrentes y renovación de series — Tentare';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Tu horario de siempre, programado una vez.', 'Series de varias semanas que avisan antes de acabarse y pueden renovarse solas.');
}

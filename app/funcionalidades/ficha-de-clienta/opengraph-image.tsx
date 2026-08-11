import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'CRM y ficha de alumna para estudios de Pilates — Tentare';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Saber quién es antes de que entre por la puerta.', 'Historial, bonos, asistencia y ficha de salud operativa.');
}

import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Software de reservas para estudios de Pilates — Tentare';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Reservan solas, a las siete de la mañana.', 'Reglas por tipo de clase y aforo a prueba de reservas simultáneas.');
}

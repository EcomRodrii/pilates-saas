import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Tentare para estudios de Yoga';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Tentare, para estudios de Yoga también.', 'Reservas, bonos, cobros y sustituciones — el mismo motor que ya usan estudios de Pilates.');
}

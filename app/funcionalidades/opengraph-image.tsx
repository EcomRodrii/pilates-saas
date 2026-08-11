import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Funcionalidades de Tentare para estudios de Pilates';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Todo lo que hace Tentare, sin adjetivos.', 'Diez áreas explicadas por lo que resuelven en un estudio de verdad.');
}

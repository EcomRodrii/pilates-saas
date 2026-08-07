import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Centro de Recursos — Tentare';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Cómo llenar, cobrar y automatizar tu estudio.', 'Guías prácticas para propietarias de estudios de Pilates.');
}

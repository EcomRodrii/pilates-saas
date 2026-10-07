import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Tentare por tipo de estudio — Pilates, reformer y yoga';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Tentare, según tu estudio.', 'Pilates, Pilates reformer, yoga, varias sedes o quien viene de otro programa.');
}

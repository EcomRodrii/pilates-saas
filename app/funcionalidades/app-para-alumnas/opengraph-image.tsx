import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'App de marca para las alumnas de tu estudio — Tentare';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Tu estudio, en su pantalla de inicio.', 'Reservar, comprar y ver su progreso en una app con tu nombre.');
}

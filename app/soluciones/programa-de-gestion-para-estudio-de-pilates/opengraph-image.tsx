import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Programa de gestión para estudios de Pilates en España — Tentare';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Un programa para llevar tu estudio de Pilates entero.', 'Reservas, bonos, cobros, facturas y sustituciones, en un solo panel, para estudios de Pilates en España.');
}

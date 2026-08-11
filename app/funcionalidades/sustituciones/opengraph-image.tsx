import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Sustituciones de instructoras automáticas — Tentare';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('La baja se cubre sola.', 'Candidatas por disponibilidad real, contacto, escalado y aviso a las alumnas.');
}

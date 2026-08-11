import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Cobro recurrente y recuperación de impagos — Tentare';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Cobra sin perseguir a nadie.', 'Tarjeta guardada, tres reintentos escalonados y remesa SEPA 19.14.');
}

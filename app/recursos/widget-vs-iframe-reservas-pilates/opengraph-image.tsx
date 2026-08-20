import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Cómo integrar reservas online en la web de tu estudio de pilates';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Cómo integrar reservas online', 'Redirección, iframe o widget nativo — comparados de verdad.');
}

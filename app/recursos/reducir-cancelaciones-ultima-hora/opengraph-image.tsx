import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Reduce las cancelaciones de última hora';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Reduce las cancelaciones de última hora', "Lo que cobran de verdad SoulCycle o Barry's, y lo que dice la evidencia clínica sobre los recordatorios.");
}

import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Comparativa: Tentare vs bsport, Mindbody y Eversports';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Tentare frente a bsport, Mindbody y Eversports.', 'Las diferencias que se notan cada día y cada fin de mes en un estudio de Pilates en España.');
}

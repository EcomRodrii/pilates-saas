import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Widget, iframe o redirección: cómo integrar reservas online';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Widget, iframe o redirección', 'Las tres formas de integrar reservas online, comparadas de verdad.');
}

import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Reformer vs. mat: cómo poner precio a cada clase';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Reformer vs. mat: cómo poner precio a cada clase', 'Dos formatos, dos costes, dos techos de ingresos.');
}

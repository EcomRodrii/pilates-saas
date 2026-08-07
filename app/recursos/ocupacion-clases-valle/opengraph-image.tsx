import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Cómo subir la ocupación de tus clases valle';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Cómo subir la ocupación de tus clases valle', 'Lo que hace ClassPass con el precio dinámico, y lo que puedes copiar sin depender de nadie.');
}

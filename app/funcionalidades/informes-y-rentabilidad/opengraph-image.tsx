import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Informes de rentabilidad y ocupación de clases — Tentare';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('¿Qué clases te dan dinero?', 'Margen por clase cruzando lo que paga cada asistente con la tarifa real.');
}

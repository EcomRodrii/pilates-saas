import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Checklist: cómo elegir el software de tu estudio';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Checklist: cómo elegir el software de tu estudio', 'Lo que dicen miles de reseñas en Capterra y G2 — y las preguntas exactas para la demo.');
}

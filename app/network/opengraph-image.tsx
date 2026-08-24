import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Tentare Network — Red de instructoras de Pilates';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Red profesional de instructoras de Pilates y Yoga.', 'Estudios buscan instructoras por especialidad, ciudad y disponibilidad. Instructoras construyen su portafolio y aceptan sustituciones.');
}

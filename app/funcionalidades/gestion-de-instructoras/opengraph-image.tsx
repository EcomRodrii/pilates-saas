import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Gestión de instructoras: disponibilidad, horas y tarifas — Tentare';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Quién puede dar qué, y cuándo.', 'Disponibilidad, vacaciones, horas, tarifas y aviso de dependencia.');
}

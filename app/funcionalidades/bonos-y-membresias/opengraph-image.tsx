import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Gestión de bonos y cuotas para estudios de Pilates — Tentare';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Cuatro formas de cobrar, en el mismo estudio.', 'Cuota mensual, bono de sesiones, clase suelta y plaza fija semanal.');
}

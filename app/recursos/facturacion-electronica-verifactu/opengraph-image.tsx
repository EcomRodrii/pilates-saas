import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Facturación electrónica para estudios de Pilates: qué cambia con Veri*factu';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Facturación electrónica: qué cambia con Veri*factu', 'Cuándo es obligatorio y qué debe tener cada factura de tu estudio.');
}

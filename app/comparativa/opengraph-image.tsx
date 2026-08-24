import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Comparativa Tentare — Software para estudios de Pilates';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Tentare frente a la competencia.', 'Sustituciones automáticas de instructoras, facturación electrónica, lista de espera inteligente y dashboards que enseñan números reales.');
}

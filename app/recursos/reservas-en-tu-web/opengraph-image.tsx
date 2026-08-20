import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Cómo integrar reservas de Pilates en tu propia web';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Cómo integrar reservas de Pilates en tu propia web', 'Sin redirigir a otra plataforma, sin perder a la alumna en el camino.');
}

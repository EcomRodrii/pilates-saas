import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Software para estudios de yoga — Tentare';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Tu estudio de yoga, sin perseguir reservas ni cuotas.', 'Reservas, bonos, mensualidades y una app con tu marca. Desde 29 €/mes con IVA.');
}

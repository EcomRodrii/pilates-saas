import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';
import { PLAN_INFO } from '@/lib/billing/entitlements';
import { LIMITES_GRATIS } from '@/lib/landing/founding-gratis';

export const alt = 'Precios de Tentare — Software para estudios de Pilates';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  // Lo mismo que dicen la página y su schema.org: Founding Studio gratis, con sus dos límites.
  return generarOgImage(
    'Precio público. Sin permanencia.',
    `Founding Studio gratis ${LIMITES_GRATIS} (si pasas de ahí, ${PLAN_INFO.BASE.precioMes}€); Estudio ${PLAN_INFO.ESTUDIO.precioMes}€ y Cadena ${PLAN_INFO.CADENA.precioMes}€ al mes.`,
  );
}

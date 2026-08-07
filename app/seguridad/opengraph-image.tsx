import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Seguridad y privacidad — Tentare';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Seguridad y privacidad.', 'Datos aislados por estudio, alojados en la UE y conformes al RGPD. Sin permanencia.');
}

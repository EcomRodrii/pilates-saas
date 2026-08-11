import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Automatizaciones y avisos por WhatsApp y email — Tentare';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Lo que se te olvida, ya está hecho.', 'Siete reglas que enciendes tú y avisos por el canal de cada una.');
}

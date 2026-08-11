import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Facturación con Veri*Factu para estudios de Pilates — Tentare';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Facturas que cumplen, sin que tengas que saber cómo.', 'Numeración correlativa, huella encadenada, QR de la AEAT y cierre anual.');
}

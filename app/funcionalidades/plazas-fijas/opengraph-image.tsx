import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Plazas fijas para estudios de Pilates — Tentare';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Su sitio de los martes, reservado sin que nadie lo pida.', 'Reserva automática cada semana, pausa con fechas y las reglas las pones tú.');
}

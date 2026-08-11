import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Calendario de clases, salas y aforo por reformer — Tentare';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Tu semana cuadrada, puesto a puesto.', 'Series recurrentes, varias salas y capacidad contada por máquina.');
}

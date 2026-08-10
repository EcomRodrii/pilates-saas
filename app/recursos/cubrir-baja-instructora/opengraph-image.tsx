import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';

export const alt = 'Cómo cubrir una baja de instructora sin hacer una llamada';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generarOgImage('Cómo cubrir una baja de instructora sin hacer una llamada', 'El proceso que roba noches a las propietarias — y cómo convertirlo en algo que ocurre solo.');
}

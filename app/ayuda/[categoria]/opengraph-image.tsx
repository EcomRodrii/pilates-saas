import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';
import { categoriaDe } from '@/lib/ayuda/registro';

// Una imagen por categoría. `opengraph-image` NO cascada a las subrutas (ver
// lib/og-image.tsx), así que sin este fichero las 14 categorías compartirían
// la nada: al compartir el enlace salía una tarjeta sin imagen.
export const alt = 'Centro de Ayuda de Tentare';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ categoria: string }> }) {
  const { categoria } = await params;
  const cat = categoriaDe(categoria);
  return generarOgImage(cat?.titulo ?? 'Centro de Ayuda', cat?.descripcion ?? 'Guías y respuestas para tu estudio.');
}

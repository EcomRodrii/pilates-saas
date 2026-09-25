import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';
import { articuloPorSlug } from '@/lib/recursos/articulos';

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;
export const alt = 'Guía de Tentare para estudios de Pilates';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = articuloPorSlug(slug);
  return generarOgImage(a?.titulo ?? 'Guías para tu estudio de Pilates', a?.seccion ?? 'Centro de Recursos de Tentare');
}

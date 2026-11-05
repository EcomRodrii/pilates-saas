import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';
import { articuloBlogPorSlug } from '@/lib/blog/articulos';
import { AUTOR_BLOG } from '@/lib/blog/autor';

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;
export const alt = 'Artículo del blog de Marcos Roca Rodríguez, fundador de Tentare';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = articuloBlogPorSlug(slug);
  return generarOgImage(a?.titulo ?? `Blog de ${AUTOR_BLOG.nombre}`, `${AUTOR_BLOG.nombre} · ${AUTOR_BLOG.cargo}`);
}

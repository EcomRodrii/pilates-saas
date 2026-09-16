import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generarOgImage } from '@/lib/og-image';
import { articuloDe, categoriaDe } from '@/lib/ayuda/registro';

// Cada artículo, con su propio titular. Son los enlaces que más se comparten
// por WhatsApp entre el estudio y su equipo: sin imagen, la tarjeta sale coja.
export const alt = 'Centro de Ayuda de Tentare';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ categoria: string; articulo: string }> }) {
  const { categoria, articulo } = await params;
  const art = articuloDe(categoria, articulo);
  const cat = categoriaDe(categoria);
  return generarOgImage(art?.titulo ?? 'Centro de Ayuda', art?.descripcion ?? cat?.descripcion ?? 'Guías y respuestas para tu estudio.');
}

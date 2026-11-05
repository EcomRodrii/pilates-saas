import { ARTICULOS_BLOG_META } from '@/lib/blog/meta';
import { rssBlog } from '@/lib/blog/schema';

// El RSS del blog personal: SOLO lo publicado. Estático: se regenera con cada despliegue, que es cuando se publica.
export const dynamic = 'force-static';

export function GET() {
  return new Response(rssBlog(ARTICULOS_BLOG_META), {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=3600' },
  });
}

import { NextResponse } from 'next/server';
import { videosPublicados } from '@/lib/ayuda/videos-servidor';

// Los vídeos PUBLICADOS de Academy, para las pantallas del panel (que son de cliente y no pueden leer la tabla: es solo servidor). Es
// contenido público —el mismo que ven las guías de /ayuda—, sin nada de ningún estudio, así que va sin sesión y con caché de unos minutos.
// Nunca falla hacia el cliente: sin tabla o sin servicio, lista vacía (un capítulo sin vídeo se ve igual, sin hueco).
export async function GET() {
  const videos = [...(await videosPublicados()).values()];
  return NextResponse.json({ videos }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } });
}

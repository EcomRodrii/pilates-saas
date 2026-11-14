import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { ARTICULOS, urlArticulo } from '@/lib/ayuda/registro';
import { validarVideo } from '@/lib/ayuda/videos';

export const runtime = 'nodejs';

// Los vídeos de las guías (`ayuda_videos`), gestionados desde /interno/ayuda por quien tiene `content.write` (el mismo permiso que el
// changelog y la lectura de feedback). El texto de las guías NO se edita aquí: sigue en código, con sus pruebas.
const GUIAS = new Map(ARTICULOS.filter(a => a.estado === 'publicado').map(a => [`${a.categoria}/${a.slug}`, a]));
const CLAVES = new Set(GUIAS.keys());

const COLUMNAS = 'articulo, video_id, hash_privado, titulo, duracion_seg, nivel, resultado, destacado, publicado, actualizado_en';

/** Que lo publicado se vea ya, sin esperar al refresco automático de la caché de la página. */
function refrescar(articulo: string) {
  const a = GUIAS.get(articulo);
  if (a) revalidatePath(urlArticulo(a));
  revalidatePath('/academy');
}

export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'content.write');
  if ('error' in g) return g.error;
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { data, error } = await db.from('ayuda_videos').select(COLUMNAS).order('actualizado_en', { ascending: false }).limit(500);
  const sinTabla = error?.code === '42P01';
  if (error && !sinTabla) return NextResponse.json({ error: 'No se han podido cargar los vídeos.' }, { status: 500 });

  const videos = new Map((data ?? []).map(v => [v.articulo as string, v]));
  // Todas las guías, con o sin vídeo: es la lista de trabajo de quien graba («esta guía aún no tiene»).
  const guias = [...GUIAS.entries()].map(([clave, a]) => ({ articulo: clave, titulo: a.titulo, categoria: a.categoria, video: videos.get(clave) ?? null }));
  return NextResponse.json({ guias, sinTabla });
}

export async function PUT(req: NextRequest) {
  const g = await exigirPermiso(req, 'content.write');
  if ('error' in g) return g.error;
  const limitado = await enforceRateLimit(req, 'interno-ayuda-videos', { max: 30, windowSeconds: 60 }, g.admin.userId);
  if (limitado) return limitado;

  const valido = validarVideo(await req.json().catch(() => null), CLAVES);
  if (!valido.ok) return NextResponse.json({ error: valido.error }, { status: 400 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { error } = await db.from('ayuda_videos').upsert({ ...valido.fila, actualizado_en: new Date().toISOString() }, { onConflict: 'articulo' });
  if (error) {
    console.error('[interno/ayuda-videos] upsert', error.code);
    return NextResponse.json({ error: error.code === '42P01' ? 'Falta aplicar la migración de Academy.' : 'No se ha podido guardar el vídeo.' }, { status: 500 });
  }
  refrescar(valido.fila.articulo);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const g = await exigirPermiso(req, 'content.write');
  if ('error' in g) return g.error;
  const articulo = new URL(req.url).searchParams.get('articulo') ?? '';
  if (!CLAVES.has(articulo)) return NextResponse.json({ error: 'Esa guía no existe.' }, { status: 400 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const { error } = await db.from('ayuda_videos').delete().eq('articulo', articulo);
  if (error) return NextResponse.json({ error: 'No se ha podido quitar el vídeo.' }, { status: 500 });
  refrescar(articulo);
  return NextResponse.json({ ok: true });
}

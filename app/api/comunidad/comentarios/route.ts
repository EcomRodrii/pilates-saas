import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { uid } from '@/lib/utils';
import type { ComentarioComunidad } from '@/lib/types';

// Persistencia de los comentarios de Comunidad (antes solo vivían en un useState
// y se perdían al refrescar). Server-authoritative: el estudio sale del JWT, no
// del body. Solo staff del propio estudio. Service-role (bypass RLS) igual que
// /api/socios/eliminar; la tabla además tiene RLS por estudio como respaldo.

function mapRow(r: Record<string, unknown>): ComentarioComunidad {
  return {
    id: r.id as string,
    studioId: r.studio_id as string,
    postId: r.post_id as string,
    autorId: (r.autor_id as string | null) ?? null,
    autorNombre: r.autor_nombre as string,
    autorInicial: (r.autor_inicial as string | null) ?? null,
    texto: r.texto as string,
    creadoEn: r.creado_en as string,
  };
}

// GET → todos los comentarios del estudio (la página los agrupa por post).
export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await admin
    .from('comentarios_comunidad')
    .select('*')
    .eq('studio_id', sesion.studioId)
    .order('creado_en', { ascending: true });
  if (error) return NextResponse.json({ error: 'No se pudieron leer los comentarios' }, { status: 500 });

  return NextResponse.json({ comentarios: (data ?? []).map(mapRow) });
}

// POST → crea un comentario en un post del estudio e incrementa comentarios_count.
export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { postId?: unknown; texto?: unknown } | null;
  const postId = typeof body?.postId === 'string' ? body.postId : null;
  const texto = typeof body?.texto === 'string' ? body.texto.trim() : '';
  if (!postId || !texto) return NextResponse.json({ error: 'Falta postId o texto' }, { status: 400 });

  // El post debe existir y ser de este estudio (autoridad: el JWT, no el body).
  const { data: post, error: errPost } = await admin
    .from('posts_comunidad')
    .select('id, comentarios_count')
    .eq('id', postId)
    .eq('studio_id', sesion.studioId)
    .maybeSingle();
  if (errPost) return NextResponse.json({ error: 'No se pudo leer el post' }, { status: 500 });
  if (!post) return NextResponse.json({ error: 'Post no encontrado' }, { status: 404 });

  const inicial = sesion.nombre.trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || 'EQ';
  const fila = {
    id: `com-${uid()}`,
    studio_id: sesion.studioId,
    post_id: postId,
    autor_id: sesion.userId,
    autor_nombre: sesion.nombre,
    autor_inicial: inicial,
    texto,
    creado_en: new Date().toISOString(),
  };
  const { error: errIns } = await admin.from('comentarios_comunidad').insert(fila);
  if (errIns) return NextResponse.json({ error: 'No se pudo guardar el comentario' }, { status: 500 });

  // Mantener comentarios_count coherente (lo usa la tarjeta y el ranking de
  // miembros más activos). Best-effort: si falla, el comentario ya está guardado.
  await admin
    .from('posts_comunidad')
    .update({ comentarios_count: (post.comentarios_count ?? 0) + 1 })
    .eq('id', postId)
    .eq('studio_id', sesion.studioId);

  return NextResponse.json({ comentario: mapRow(fila) });
}

import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { uid } from '@/lib/utils';

// Comentarios del tablón para el PORTAL — antes el tablón ni siquiera enseñaba
// el contador de comentarios a la socia (ver lib/student/tipos.ts), y no
// existía ninguna vía para que escribiera uno. Mismo patrón que
// app/api/comunidad/comentarios/route.ts (staff) pero con la comprobación de
// identidad de socia — service-role + socioAutenticado, nunca RLS directa
// (la socia no tiene JWT `authenticated` de Postgres).
//
// A diferencia del staff (que trae TODOS los comentarios del estudio de una
// vez para su propia bandeja interna), aquí se pide por post: la socia solo
// necesita el hilo del post que ha abierto, no el histórico entero del
// tablón cada vez que entra a Comunidad.

function mapRow(r: Record<string, unknown>) {
  return {
    id: r.id as string,
    postId: r.post_id as string,
    autorNombre: r.autor_nombre as string,
    autorInicial: (r.autor_inicial as string | null) ?? null,
    texto: r.texto as string,
    creadoEn: r.creado_en as string,
    esMio: false,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const studioId = searchParams.get('studioId');
  const postId = searchParams.get('postId');
  if (!studioId || !postId) return errorPeticion('Falta el estudio o la publicación.');

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await admin
    .from('comentarios_comunidad')
    .select('*')
    .eq('studio_id', studioId)
    .eq('post_id', postId)
    .order('creado_en', { ascending: true });
  if (error) return errorInterno('public/comunidad/comentarios:GET', error, 'No se han podido cargar los comentarios.');

  const comentarios = (data ?? []).map(row => ({ ...mapRow(row), esMio: row.autor_id === user.userId }));
  return NextResponse.json({ comentarios });
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-comunidad-comentarios', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { studioId?: unknown; postId?: unknown; texto?: unknown } | null;
  const studioId = typeof body?.studioId === 'string' ? body.studioId : null;
  const postId = typeof body?.postId === 'string' ? body.postId : null;
  const texto = typeof body?.texto === 'string' ? body.texto.trim() : '';
  if (!studioId || !postId) return errorPeticion('Falta el estudio o la publicación.');
  if (!texto || texto.length < 1 || texto.length > 1000) {
    return errorPeticion('El comentario debe tener entre 1 y 1000 caracteres.');
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  // El post debe existir y ser de este estudio — autoridad del JWT, nunca del body.
  const { data: post, error: errPost } = await admin
    .from('posts_comunidad')
    .select('id, comentarios_count')
    .eq('id', postId)
    .eq('studio_id', studioId)
    .maybeSingle();
  if (errPost) return errorInterno('public/comunidad/comentarios:POST', errPost, 'No se ha podido leer la publicación.');
  if (!post) return NextResponse.json({ error: 'Publicación no encontrada.' }, { status: 404 });

  const { data: socio, error: errSocio } = await admin
    .from('socios').select('nombre, apellidos').eq('id', socioId).maybeSingle();
  if (errSocio || !socio) return errorInterno('public/comunidad/comentarios:POST', errSocio, 'No se ha podido leer tu ficha.');

  const nombreCompleto = `${socio.nombre} ${socio.apellidos ?? ''}`.trim();
  const inicial = nombreCompleto.split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || 'S';
  const fila = {
    id: `com-${uid()}`,
    studio_id: studioId,
    post_id: postId,
    autor_id: user.userId,
    autor_nombre: nombreCompleto || 'Clienta',
    autor_inicial: inicial,
    texto,
    creado_en: new Date().toISOString(),
  };
  const { error: errIns } = await admin.from('comentarios_comunidad').insert(fila);
  if (errIns) return errorInterno('public/comunidad/comentarios:POST', errIns, 'No se ha podido guardar el comentario.');

  // Best-effort, igual que en el lado staff: si esto falla el comentario ya está guardado.
  await admin
    .from('posts_comunidad')
    .update({ comentarios_count: (post.comentarios_count ?? 0) + 1 })
    .eq('id', postId)
    .eq('studio_id', studioId);

  return NextResponse.json({ comentario: { ...mapRow(fila), esMio: true } });
}

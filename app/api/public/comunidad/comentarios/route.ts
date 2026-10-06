import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { socioEnLaAudiencia, audienciaDelPost } from '@/lib/comunidad/audiencia';
import { antesDePublicar, cuerpoNoPublicar } from '@/lib/moderacion/normas-servidor';
import { bloqueadasConmigo, filaComentarioDeSocia } from '@/lib/comunidad/comentarios-servidor';
import { filtrarComentariosParaSocia } from '@/lib/comunidad/comentarios-reglas';
import type { DestinatariosCampana } from '@/lib/types';

// Comentarios del tablón para el PORTAL — antes el tablón ni siquiera enseñaba
// el contador de comentarios a la socia (ver lib/student/tipos.ts), y no
// existía ninguna vía para que escribiera uno. Mismo patrón que
// app/api/comunidad/comentarios/route.ts (staff) pero con la comprobación de
// identidad de socia — service-role + socioAutenticado, nunca RLS directa (la
// socia tiene JWT de Supabase, pero el tablón no se le abre por PostgREST: todo
// lo suyo pasa por aquí, y aquí la RLS no actúa).
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
    /** Retirado por el estudio (moderación). Solo lo ve así quien lo escribió. */
    oculto: Boolean(r.oculto_en),
    /** De una alumna (no del equipo): se puede bloquear a quien lo escribió. Nunca va su ficha. */
    deAlumna: r.socio_id != null,
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

  // Mismo guard que el hermano `posts/[id]/asistentes` (F-24): el filtro de
  // audiencia se aplica al LISTADO de posts, pero se saltaba en cuanto se pide
  // por `postId` — y los ids son adivinables. Sin esto, una socia fuera del
  // segmento lee el hilo entero de un post que no va dirigido a ella.
  const audiencia = await audienciaDelPost(admin, { postId, studioId });
  if (!audiencia) return NextResponse.json({ error: 'Publicación no encontrada.' }, { status: 404 });
  if (!await socioEnLaAudiencia(admin, { studioId, socioId, audiencia })) {
    return NextResponse.json({ error: 'Esta publicación no está dirigida a ti' }, { status: 403 });
  }

  const [{ data, error }, bloqueadas] = await Promise.all([
    admin
      .from('comentarios_comunidad')
      .select('*')
      .eq('studio_id', studioId)
      .eq('post_id', postId)
      .order('creado_en', { ascending: true }),
    bloqueadasConmigo(admin, studioId, socioId).catch(() => null),
  ]);
  if (error) return errorInterno('public/comunidad/comentarios:GET', error, 'No se han podido cargar los comentarios.');
  if (!bloqueadas) return errorInterno('public/comunidad/comentarios:GET', new Error('no se han podido leer los bloqueos'), 'No se han podido cargar los comentarios.');

  // Suyo: por su cuenta o por su ficha (si borró la cuenta y volvió con otra, la
  // cuenta vieja ya no la reconoce). Lo retirado solo lo ve quien lo escribió;
  // nada de alguien con quien hay un bloqueo; y en una publicación para un
  // grupo, solo lo suyo y lo del estudio (`filtrarComentariosParaSocia`).
  const comentarios = filtrarComentariosParaSocia(
    (data ?? []) as (Record<string, unknown> & { socio_id: string | null; autor_id: string | null; oculto_en: string | null })[],
    { socioId, authUserId: user.userId, audiencia, bloqueadas },
  ).map(row => ({ ...mapRow(row), esMio: row.esMio }));
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
    .select('id, comentarios_count, audiencia')
    .eq('id', postId)
    .eq('studio_id', studioId)
    .maybeSingle();
  if (errPost) return errorInterno('public/comunidad/comentarios:POST', errPost, 'No se ha podido leer la publicación.');
  if (!post) return NextResponse.json({ error: 'Publicación no encontrada.' }, { status: 404 });

  // Escribir pesa más que leer: el comentario lo verán el staff y todo el
  // segmento destinatario. Mismo guard de audiencia que el GET y que el RSVP.
  const audiencia = ((post.audiencia as DestinatariosCampana | null) ?? 'TODAS');
  if (!await socioEnLaAudiencia(admin, { studioId, socioId, audiencia })) {
    return NextResponse.json({ error: 'Esta publicación no está dirigida a ti' }, { status: 403 });
  }

  // Normas aceptadas y filtro de palabras (App Store 1.2), antes de guardar nada.
  try {
    const motivo = await antesDePublicar(admin, user.userId, texto);
    if (motivo) return NextResponse.json(cuerpoNoPublicar(motivo), { status: motivo.status });
  } catch (e) {
    return errorInterno('public/comunidad/comentarios:POST:normas', e, 'No se ha podido guardar el comentario.');
  }

  const { data: socio, error: errSocio } = await admin
    .from('socios').select('nombre, apellidos').eq('id', socioId).maybeSingle();
  if (errSocio || !socio) return errorInterno('public/comunidad/comentarios:POST', errSocio, 'No se ha podido leer tu ficha.');

  // Con nombre e inicial («Lucía M.»), nunca sus apellidos: lo leen sus compañeras.
  const fila = filaComentarioDeSocia({
    studioId, postId, authUserId: user.userId, socioId, texto,
    socio: { nombre: socio.nombre as string | null, apellidos: (socio.apellidos as string | null) ?? null },
  });
  const { error: errIns } = await admin.from('comentarios_comunidad').insert(fila);
  if (errIns) return errorInterno('public/comunidad/comentarios:POST', errIns, 'No se ha podido guardar el comentario.');

  // Best-effort, igual que en el lado staff: si esto falla el comentario ya
  // está guardado. Incremento ATÓMICO (33ª pasada de auditoría) — ver
  // ajustar_comentarios_count.
  await admin.rpc('ajustar_comentarios_count', { p_post_id: postId, p_studio_id: studioId, p_delta: 1 });

  return NextResponse.json({ comentario: { ...mapRow(fila), esMio: true } });
}

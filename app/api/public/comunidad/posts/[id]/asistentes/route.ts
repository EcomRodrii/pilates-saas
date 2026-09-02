import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import type { RowPostsComunidad } from '@/lib/db-types';

// Eventos como entidad propia dentro del Feed (P2 Community & Messaging OS).
// Apuntarse/desapuntarse de un evento del tablón, desde el portal de la
// socia. Mismo patrón de auth que el resto de app/api/public/comunidad/** y
// app/api/public/mensajeria/**: la socia no tiene JWT `authenticated` de
// Postgres en este endpoint (su sesión no llega a auth.uid() en RLS), así
// que se usa service-role y se comprueba `socioAutenticado` a mano.
//
// Migración real: `supabase/migrations/20260826210000_posts_comunidad_eventos.sql`.
//   - Tabla `post_evento_asistentes(post_id text, socio_id text, creado_en)`,
//     PK compuesta `(post_id, socio_id)`.
//   - RPC `apuntarse_evento_comunidad(p_post_id text, p_socio_id text)`,
//     SECURITY DEFINER, que hace el INSERT con lock (comprobando
//     `evento_aforo` de `posts_comunidad` de forma atómica) y lanza una
//     excepción de aforo lleno si no cabe (mapeada abajo a 409). Se llama
//     vía RPC y no con un INSERT directo porque el aforo hay que
//     comprobarlo con lock, no en TypeScript (mismo criterio que
//     `reservar_plaza`/`aceptar_oferta_lista_espera`).

type BodyAsistentes = { studioId?: unknown };

async function cargarPostEvento(
  admin: ReturnType<typeof getSupabaseAdmin>,
  postId: string,
  studioId: string,
): Promise<{ error: NextResponse } | { post: RowPostsComunidad }> {
  const { data: post, error } = await admin!
    .from('posts_comunidad')
    .select('*')
    .eq('id', postId)
    .maybeSingle();
  if (error) return { error: errorInterno('public/comunidad/posts/asistentes', error, 'No se ha podido cargar el evento.') };
  if (!post || (post as RowPostsComunidad).studio_id !== studioId) {
    return { error: NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 }) };
  }
  if ((post as RowPostsComunidad).tipo !== 'EVENTO') {
    return { error: NextResponse.json({ error: 'Este post no es un evento' }, { status: 400 }) };
  }
  return { post: post as RowPostsComunidad };
}

async function autenticar(req: NextRequest, studioId: string) {
  const user = await verificarUsuarioSupabase(req);
  if (!user) return null;
  return socioAutenticado(user.userId, studioId);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'public-comunidad-asistentes', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as BodyAsistentes | null;
  const studioId = typeof body?.studioId === 'string' ? body.studioId : '';
  if (!studioId) return errorPeticion('Falta el estudio.');

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const socioId = await autenticar(req, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id: postId } = await params;
  const cargado = await cargarPostEvento(admin, postId, studioId);
  if ('error' in cargado) return cargado.error;

  const { data, error } = await admin.rpc('apuntarse_evento_comunidad', {
    p_post_id: postId,
    p_socio_id: socioId,
  });

  if (error) {
    return errorInterno('public/comunidad/posts/asistentes:POST', error, 'No se ha podido apuntar al evento.');
  }

  // La RPC (`apuntarse_evento_comunidad`, migración `20260826210000`) devuelve
  // `false` SIN lanzar excepción cuando el aforo está lleno — comprobarlo aquí
  // es obligatorio, no un caso más de `error` (no lo es). `ON CONFLICT DO
  // NOTHING` dentro de la RPC hace que apuntarse dos veces siempre devuelva
  // `true` (idempotente), así que nunca llega un 23505 real desde aquí.
  const inscrita = data === true;
  if (!inscrita) {
    return NextResponse.json({ error: 'Este evento ya está completo' }, { status: 409 });
  }

  const totalAsistentes = await contarAsistentes(admin, postId);
  return NextResponse.json({ apuntada: true, totalAsistentes });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'public-comunidad-asistentes', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as BodyAsistentes | null;
  const studioId = typeof body?.studioId === 'string' ? body.studioId : '';
  if (!studioId) return errorPeticion('Falta el estudio.');

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const socioId = await autenticar(req, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id: postId } = await params;
  const cargado = await cargarPostEvento(admin, postId, studioId);
  if ('error' in cargado) return cargado.error;

  // Delete directo por PK compuesta, sin RPC: desapuntarse nunca compite por
  // aforo hacia arriba (solo libera), así que no hace falta lock.
  const { error } = await admin
    .from('post_evento_asistentes')
    .delete()
    .eq('post_id', postId)
    .eq('socio_id', socioId);
  if (error) return errorInterno('public/comunidad/posts/asistentes:DELETE', error, 'No se ha podido desapuntar del evento.');

  const totalAsistentes = await contarAsistentes(admin, postId);
  return NextResponse.json({ apuntada: false, totalAsistentes });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'public-comunidad-asistentes-get', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const studioId = searchParams.get('studioId') ?? '';
  if (!studioId) return errorPeticion('Falta el estudio.');

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const socioId = await autenticar(req, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id: postId } = await params;
  const cargado = await cargarPostEvento(admin, postId, studioId);
  if ('error' in cargado) return cargado.error;

  const [{ data: miFila }, totalAsistentes] = await Promise.all([
    admin.from('post_evento_asistentes').select('post_id').eq('post_id', postId).eq('socio_id', socioId).maybeSingle(),
    contarAsistentes(admin, postId),
  ]);

  return NextResponse.json({ apuntada: !!miFila, totalAsistentes });
}

async function contarAsistentes(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, postId: string): Promise<number> {
  const { count } = await admin
    .from('post_evento_asistentes')
    .select('*', { count: 'exact', head: true })
    .eq('post_id', postId);
  return count ?? 0;
}

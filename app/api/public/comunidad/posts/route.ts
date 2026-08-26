import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { resolverDestinatariasCampana } from '@/lib/marketing/segmentos';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import type { Socio, Suscripcion, Recibo, DestinatariosCampana } from '@/lib/types';
import type { RowPostsComunidad } from '@/lib/db-types';

const LIMITE_DEFECTO = 20;
const LIMITE_MAXIMO = 50;

// Feed de Comunidad para el PORTAL (P1, solo lectura — sin comentarios ni
// likes de socia en esta pieza, decisión ya cerrada del diseño). Mismo
// patrón que /api/public/mensajeria/conversaciones: la socia no tiene JWT
// `authenticated` de Postgres (su sesión no llega a auth.uid() en RLS), así
// que esta ruta usa service-role y filtra a mano — nunca confía en RLS para
// resolver quién es ella.
//
// El filtro de audiencia por post reutiliza `resolverDestinatariasCampana`
// TAL CUAL (misma función que ya resuelve el segmento de una campaña de
// marketing) — evaluada sobre un `SnapshotEstudio` de UNA sola socia: la
// suya. Nunca se traen socios/suscripciones/recibos de otras socias del
// estudio a este endpoint.
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-comunidad-posts', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const studioId = searchParams.get('studioId');
  if (!studioId) return errorPeticion('Falta el estudio.');

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const [{ data: socioRow }, { data: susRaw }, { data: recRaw }] = await Promise.all([
    admin.from('socios').select('id, activo, tags, fecha_nacimiento').eq('id', socioId).maybeSingle(),
    admin.from('suscripciones')
      .select('socio_id, estado, sesiones_restantes, fecha_fin')
      .eq('studio_id', studioId).eq('socio_id', socioId).eq('estado', 'ACTIVA'),
    admin.from('recibos').select('socio_id, estado').eq('studio_id', studioId).eq('socio_id', socioId).eq('estado', 'FALLIDO'),
  ]);
  if (!socioRow) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const misDatos = {
    socios: [{
      id: socioRow.id, activo: socioRow.activo, tags: socioRow.tags ?? undefined,
      fechaNacimiento: socioRow.fecha_nacimiento ?? undefined,
    }] as unknown as Socio[],
    suscripciones: (susRaw ?? []).map(r => ({
      socioId: r.socio_id, estado: r.estado, sesionesRestantes: r.sesiones_restantes, fechaFin: r.fecha_fin,
    })) as unknown as Suscripcion[],
    recibos: (recRaw ?? []).map(r => ({ socioId: r.socio_id, estado: r.estado })) as unknown as Recibo[],
  };

  const antes = searchParams.get('antes');
  const limiteParam = Number(searchParams.get('limite'));
  const limite = Number.isFinite(limiteParam) && limiteParam > 0 ? Math.min(limiteParam, LIMITE_MAXIMO) : LIMITE_DEFECTO;

  // Se pide algo más de lo que hace falta (3x, tope 150) porque el filtro de
  // audiencia se aplica DESPUÉS de traer la página: sin margen, un post no
  // visible para esta socia (p. ej. dirigido solo a BONO) podría vaciar una
  // página entera y devolver menos de `limite` aunque sí hubiera más posts
  // reales para ella más atrás.
  let query = admin.from('posts_comunidad').select('*').eq('studio_id', studioId)
    .order('creado_en', { ascending: false }).limit(Math.min(limite * 3, 150));
  if (antes) query = query.lt('creado_en', antes);

  const { data, error } = await query;
  if (error) return errorInterno('public/comunidad/posts:GET', error, 'No se ha podido cargar el tablón.');

  const now = new Date();
  const visibles = ((data ?? []) as RowPostsComunidad[]).filter(row => {
    const audiencia = (row.audiencia as DestinatariosCampana | null) ?? 'TODAS';
    return resolverDestinatariasCampana(audiencia, misDatos, now).length > 0;
  }).slice(0, limite);

  // Eventos como entidad propia dentro del Feed (P2): conteo de asistentes
  // por evento, una sola query agregada sobre los posts de esta página —
  // nunca N+1. Se salta del todo si ningún post de la página es un evento
  // (el caso común, un feed de solo texto).
  const idsEventos = visibles.filter(row => row.tipo === 'EVENTO').map(row => row.id);
  const totalPorPost = new Map<string, number>();
  if (idsEventos.length > 0) {
    const { data: asistentesRaw } = await admin
      .from('post_evento_asistentes')
      .select('post_id')
      .in('post_id', idsEventos);
    for (const row of (asistentesRaw ?? []) as { post_id: string }[]) {
      totalPorPost.set(row.post_id, (totalPorPost.get(row.post_id) ?? 0) + 1);
    }
  }

  return NextResponse.json({
    posts: visibles.map(row => ({
      id: row.id,
      texto: row.texto,
      imagenUrl: row.imagen_url ?? null,
      autorNombre: row.autor_nombre,
      autorInicial: row.autor_inicial,
      creadoEn: row.creado_en,
      likes: row.likes ?? 0,
      comentariosCount: row.comentarios_count ?? 0,
      tipo: (row.tipo as 'TEXTO' | 'EVENTO' | null) ?? 'TEXTO',
      eventoFecha: row.evento_fecha ?? null,
      eventoAforo: row.evento_aforo ?? null,
      eventoLugar: row.evento_lugar ?? null,
      // undefined (omitido en el JSON) para un post que no es evento, nunca
      // 0 — distingue "no es evento" de "evento con cero asistentes".
      totalAsistentes: row.tipo === 'EVENTO' ? (totalPorPost.get(row.id) ?? 0) : undefined,
    })),
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { resolverDestinatariasCampana, segmentoNecesitaEstado } from '@/lib/marketing/segmentos';
import { cargarEstadosClientas } from '@/lib/clientas/estado-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import type { Socio, Suscripcion, Recibo, DestinatariosCampana } from '@/lib/types';
import type { RowPostsComunidad } from '@/lib/db-types';
import { esPublicacionDeGrupo } from '@/lib/comunidad/comentarios-reglas';

/** Cuántas fijadas, como mucho, encabezan el tablón. */
const MAX_FIJADAS = 10;

const LIMITE_DEFECTO = 20;
const LIMITE_MAXIMO = 50;

// Feed de Comunidad para el PORTAL. P1 lo dejó de solo lectura para la socia
// (decisión de diseño de entonces) — P2 (pedido expreso del usuario tras
// verlo en producción: "nadie puede dar like, nadie puede comentar") abre
// like real (`likedByMe` aquí, alternar en /posts/[id]/like) y comentarios
// (/api/public/comunidad/comentarios). Mismo patrón que
// /api/public/mensajeria/conversaciones: la socia tiene JWT de Supabase, pero
// el tablón no se le abre por PostgREST, así que esta ruta usa service-role
// (aquí la RLS no actúa) y filtra a mano — nunca confía en RLS para resolver
// quién es ella.
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

  const [{ data: socioRow }, { data: susRaw }, { data: recRaw }, { data: studioRow }] = await Promise.all([
    admin.from('socios').select('id, activo, tags, fecha_nacimiento').eq('id', socioId).maybeSingle(),
    admin.from('suscripciones')
      .select('socio_id, estado, sesiones_restantes, fecha_fin')
      .eq('studio_id', studioId).eq('socio_id', socioId).eq('estado', 'ACTIVA'),
    admin.from('recibos').select('socio_id, estado').eq('studio_id', studioId).eq('socio_id', socioId).eq('estado', 'FALLIDO'),
    admin.from('studios').select('nombre, logo_url').eq('id', studioId).maybeSingle(),
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
  //
  // Fijadas primero: el «Fijar» del panel tiene que llegar a la alumna. Van
  // aparte, solo en la primera página y encima de todo; las páginas siguientes
  // (por `antes`) solo traen las demás, así una fijada no sale dos veces.
  let query = admin.from('posts_comunidad').select('*').eq('studio_id', studioId)
    .or('fijado.is.null,fijado.eq.false')
    .order('creado_en', { ascending: false }).limit(Math.min(limite * 3, 150));
  if (antes) query = query.lt('creado_en', antes);

  const [{ data, error }, fijadasRes] = await Promise.all([
    query,
    antes
      ? Promise.resolve({ data: [] as RowPostsComunidad[], error: null })
      : admin.from('posts_comunidad').select('*').eq('studio_id', studioId).eq('fijado', true)
        .order('creado_en', { ascending: false }).limit(MAX_FIJADAS),
  ]);
  if (error) return errorInterno('public/comunidad/posts:GET', error, 'No se ha podido cargar el tablón.');
  if (fijadasRes.error) return errorInterno('public/comunidad/posts:GET', fijadasRes.error, 'No se ha podido cargar el tablón.');

  const now = new Date();
  const fijadas = (fijadasRes.data ?? []) as RowPostsComunidad[];
  const filas = [...fijadas, ...((data ?? []) as RowPostsComunidad[])];
  const audienciaDe = (row: RowPostsComunidad) => (row.audiencia as DestinatariosCampana | null) ?? 'TODAS';
  // Su estado (Activa, Sin renovar…) solo si algún post de la página va a un
  // segmento que lo usa: el caso común (todo «Todas») no lee nada más. Si no se
  // puede leer, esos posts no se le enseñan (mejor que enseñarle lo que no toca).
  const estados = filas.some(r => segmentoNecesitaEstado(audienciaDe(r)))
    ? await cargarEstadosClientas(admin, studioId, { ahora: now, socioIds: [socioId] })
    : null;
  const visibles = filas.filter(row =>
    resolverDestinatariasCampana(audienciaDe(row), { ...misDatos, estados }, now).length > 0,
  ).slice(0, fijadas.length + limite);

  // En una publicación para un grupo cada alumna ve solo sus comentarios y los
  // del estudio (`filtrarComentariosParaSocia`): el contador cuenta esos, no
  // los de las demás (diría cuántas más hay en el grupo).
  const deGrupo = visibles.filter(row => esPublicacionDeGrupo(audienciaDe(row))).map(row => row.id);
  const comentariosVisibles = new Map<string, number>();
  if (deGrupo.length > 0) {
    const { data: coms, error: errComs } = await admin.from('comentarios_comunidad').select('post_id')
      .eq('studio_id', studioId).in('post_id', deGrupo).is('oculto_en', null)
      .or(`socio_id.is.null,socio_id.eq.${socioId}`);
    if (errComs) return errorInterno('public/comunidad/posts:GET', errComs, 'No se ha podido cargar el tablón.');
    for (const c of (coms ?? []) as { post_id: string }[]) comentariosVisibles.set(c.post_id, (comentariosVisibles.get(c.post_id) ?? 0) + 1);
  }

  // Eventos como entidad propia dentro del Feed (P2): conteo de asistentes
  // por evento, una sola query agregada sobre los posts de esta página —
  // nunca N+1. Se salta del todo si ningún post de la página es un evento
  // (el caso común, un feed de solo texto).
  // Qué posts de ESTA página ya ha likeado esta socia — una sola consulta
  // acotada a los ids visibles, nunca "todos sus likes de la historia".
  const misLikes = new Set<string>();
  if (visibles.length > 0) {
    const { data: likesRaw } = await admin
      .from('post_likes')
      .select('post_id')
      .eq('user_id', user.userId)
      .in('post_id', visibles.map(row => row.id));
    for (const row of (likesRaw ?? []) as { post_id: string }[]) misLikes.add(row.post_id);
  }

  const idsEventos = visibles.filter(row => row.tipo === 'EVENTO').map(row => row.id);
  const totalPorPost = new Map<string, number>();
  // Si ESTA socia ya está apuntada: sin esto la app no sabe si pintar «Me
  // apunto» o «Ya no voy». Se resuelve de la misma consulta (trae socio_id),
  // sin una segunda ida.
  const misEventos = new Set<string>();
  if (idsEventos.length > 0) {
    const { data: asistentesRaw } = await admin
      .from('post_evento_asistentes')
      .select('post_id, socio_id')
      .in('post_id', idsEventos);
    for (const row of (asistentesRaw ?? []) as { post_id: string; socio_id: string }[]) {
      totalPorPost.set(row.post_id, (totalPorPost.get(row.post_id) ?? 0) + 1);
      if (row.socio_id === socioId) misEventos.add(row.post_id);
    }
  }

  return NextResponse.json({
    posts: visibles.map(row => ({
      id: row.id,
      texto: row.texto,
      imagenUrl: row.imagen_url ?? null,
      autorNombre: row.autor_nombre,
      autorInicial: row.autor_inicial,
      // Mismo criterio que el panel (PR #1807): no hay fila STAFF distinta
      // para "el estudio" — se reconoce porque quien publicó se llama igual
      // que el estudio (cuenta de mostrador). Un post firmado por una
      // instructora concreta sigue enseñando sus iniciales, no el logo.
      logoUrl: studioRow?.logo_url && row.autor_nombre === studioRow.nombre ? studioRow.logo_url : null,
      creadoEn: row.creado_en,
      likes: row.likes ?? 0,
      likedByMe: misLikes.has(row.id),
      comentariosCount: deGrupo.includes(row.id) ? (comentariosVisibles.get(row.id) ?? 0) : (row.comentarios_count ?? 0),
      /** Fijada por el estudio: va arriba y lleva la marca «Fijado». */
      fijado: row.fijado === true,
      tipo: (row.tipo as 'TEXTO' | 'EVENTO' | null) ?? 'TEXTO',
      eventoFecha: row.evento_fecha ?? null,
      eventoAforo: row.evento_aforo ?? null,
      eventoLugar: row.evento_lugar ?? null,
      // undefined (omitido en el JSON) para un post que no es evento, nunca
      // 0 — distingue "no es evento" de "evento con cero asistentes".
      totalAsistentes: row.tipo === 'EVENTO' ? (totalPorPost.get(row.id) ?? 0) : undefined,
      apuntada: row.tipo === 'EVENTO' ? misEventos.has(row.id) : undefined,
    })),
  });
}

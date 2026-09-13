import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { resolverStudioPorSlug, socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { emitirSolicitudDerechos } from '@/lib/notifications/emit';
import { esTipoSolicitud, mapSolicitudDerechos } from '@/lib/socios/solicitudes-derechos';

// Derechos RGPD de la ALUMNA desde su app, lado solicitud:
//   GET   → su estado: oposición al perfilado + sus solicitudes.
//   POST  → pide al estudio suprimir, limitar u oponerse (tabla
//           `solicitudes_derechos`). Idempotente: no duplica una pendiente.
//   PATCH → «No usar mis datos para recomendaciones automáticas» (art. 21).
//
// La descarga de sus datos va aparte (`/api/public/mis-datos`): esa es al
// momento; esto son peticiones que resuelve el estudio, que es el responsable.
//
// Un solo mecanismo de auth para los tres: JWT de la socia + `socioAutenticado`
// con el estudio del slug. La identidad nunca sale del cuerpo de la petición.

const COLUMNAS = 'id, socio_id, tipo, estado, solicitada_en, plazo_hasta, resuelta_en, nota';

type SociaResuelta = { admin: SupabaseClient; studioId: string; socioId: string };

async function resolverSocia(req: NextRequest, slug: unknown): Promise<SociaResuelta | NextResponse> {
  if (typeof slug !== 'string' || !slug.trim()) return errorPeticion('Falta el estudio.');
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const estudio = await resolverStudioPorSlug(admin as never, slug.trim());
  if (!estudio) return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });
  const studioId = String(estudio.row.id);
  const socioId = await socioAutenticado(user.userId, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  return { admin, studioId, socioId };
}

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-solicitud-derechos-get', { max: 30, windowSeconds: 60 });
  if (limited) return limited;
  const r = await resolverSocia(req, req.nextUrl.searchParams.get('slug'));
  if (r instanceof NextResponse) return r;

  const [{ data: socia, error: eSocia }, { data: filas, error: eSol }] = await Promise.all([
    r.admin.from('socios').select('excluir_de_perfilado').eq('id', r.socioId).eq('studio_id', r.studioId).maybeSingle(),
    r.admin.from('solicitudes_derechos').select(COLUMNAS)
      .eq('studio_id', r.studioId).eq('socio_id', r.socioId).order('solicitada_en', { ascending: false }),
  ]);
  if (eSocia || eSol) return errorInterno('public/solicitud-derechos:GET', eSocia ?? eSol, 'No hemos podido cargar tus datos.');
  return NextResponse.json({
    excluirDePerfilado: socia?.excluir_de_perfilado === true,
    solicitudes: (filas ?? []).map(f => mapSolicitudDerechos(f)),
  });
}

export async function POST(req: NextRequest) {
  // Una solicitud avisa por email al estudio: tope bajo.
  const limited = await enforceRateLimit(req, 'public-solicitud-derechos-post', { max: 5, windowSeconds: 600 });
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as { slug?: unknown; tipo?: unknown } | null;
  if (!esTipoSolicitud(body?.tipo)) return errorPeticion('Tipo de solicitud no válido.');
  const tipo = body.tipo;
  const r = await resolverSocia(req, body?.slug);
  if (r instanceof NextResponse) return r;

  const pendiente = async () => r.admin.from('solicitudes_derechos').select(COLUMNAS)
    .eq('studio_id', r.studioId).eq('socio_id', r.socioId).eq('tipo', tipo).eq('estado', 'pendiente').maybeSingle();

  // Idempotente: si ya hay una pendiente del mismo tipo, se devuelve esa.
  const { data: existente, error: eExistente } = await pendiente();
  if (eExistente) return errorInterno('public/solicitud-derechos:POST:leer', eExistente, 'No hemos podido enviar tu solicitud.');
  if (existente) return NextResponse.json({ solicitud: mapSolicitudDerechos(existente), yaExistia: true });

  // `plazo_hasta` y `estado` los pone la BD (DEFAULT): el plazo no se decide aquí.
  const { data: creada, error: eCrear } = await r.admin.from('solicitudes_derechos')
    .insert({ studio_id: r.studioId, socio_id: r.socioId, tipo })
    .select(COLUMNAS).single();
  if (eCrear) {
    // Carrera con otra petición igual (doble toque): el índice único parcial la
    // ha frenado, y la que ganó es la respuesta correcta.
    if (eCrear.code === '23505') {
      const { data: ganadora } = await pendiente();
      if (ganadora) return NextResponse.json({ solicitud: mapSolicitudDerechos(ganadora), yaExistia: true });
    }
    return errorInterno('public/solicitud-derechos:POST:crear', eCrear, 'No hemos podido enviar tu solicitud.');
  }

  const solicitud = mapSolicitudDerechos(creada);
  // Best-effort por dentro (una notificación nunca rompe el negocio), pero con
  // await: en serverless, lo que no se espera puede no llegar a ejecutarse.
  await emitirSolicitudDerechos(r.admin, {
    studioId: r.studioId, solicitudId: solicitud.id, socioId: r.socioId, tipo, plazoHasta: solicitud.plazoHasta,
  });
  return NextResponse.json({ solicitud, yaExistia: false }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-solicitud-derechos-patch', { max: 20, windowSeconds: 60 });
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as { slug?: unknown; excluirDePerfilado?: unknown } | null;
  if (typeof body?.excluirDePerfilado !== 'boolean') return errorPeticion('Falta el valor.');
  const valor = body.excluirDePerfilado;
  const r = await resolverSocia(req, body.slug);
  if (r instanceof NextResponse) return r;

  // Se devuelve lo que QUEDÓ escrito, no lo que se pidió: la pantalla pinta eso.
  const { data, error } = await r.admin.from('socios')
    .update({ excluir_de_perfilado: valor })
    .eq('id', r.socioId).eq('studio_id', r.studioId)
    .select('excluir_de_perfilado').maybeSingle();
  if (error) return errorInterno('public/solicitud-derechos:PATCH', error, 'No hemos podido guardar el cambio.');
  if (!data) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  return NextResponse.json({ excluirDePerfilado: data.excluir_de_perfilado === true });
}

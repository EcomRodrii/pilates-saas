import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import type { RowConversaciones, RowConversacionParticipantes } from '@/lib/db-types';

const TIPOS_ABRIBLES = ['ALUMNA_INSTRUCTORA', 'ALUMNA_MOSTRADOR'] as const;
type TipoAbrible = (typeof TIPOS_ABRIBLES)[number];

// Abre (o reutiliza) una conversación desde el PORTAL. `studioId` se acepta
// del body (dato público, mismo criterio que /api/public/favoritos y
// /api/public/retos: no es secreto, la socia ya está navegando ese estudio
// concreto) — pero `socioId` NUNCA sale del body: se deriva del JWT
// verificado vía `socioAutenticado`, así nadie puede abrir una conversación
// en nombre de otra socia.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-mensajeria-conversaciones', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as {
    studioId?: string; tipo?: string; instructorId?: string;
  } | null;

  if (!body?.studioId || !body?.tipo || !TIPOS_ABRIBLES.includes(body.tipo as TipoAbrible)) {
    return errorPeticion('Faltan datos para abrir la conversación.');
  }
  const tipo = body.tipo as TipoAbrible;
  if (tipo === 'ALUMNA_INSTRUCTORA' && !body.instructorId) {
    return errorPeticion('Falta la instructora.');
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, body.studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await admin.rpc('abrir_conversacion', {
    p_studio_id: body.studioId,
    p_tipo: tipo,
    p_socio_id: socioId,
    p_instructor_id: tipo === 'ALUMNA_INSTRUCTORA' ? body.instructorId : null,
    p_ancla_sesion_id: null,
    p_ancla_reserva_id: null,
  });

  if (error) {
    if (error.message.includes('SIN_RELACION_VALIDA')) {
      return errorPeticion('No tienes ninguna clase con esta instructora, no se puede abrir la conversación.');
    }
    if (error.message.includes('PARTICIPANTE_SIN_CUENTA')) {
      return errorPeticion('Esa instructora todavía no tiene cuenta vinculada.');
    }
    if (error.message.includes('PARAMETROS_INCOMPLETOS') || error.message.includes('TIPO_INVALIDO')) {
      return errorPeticion('Faltan datos para abrir la conversación.');
    }
    return errorInterno('public/mensajeria/conversaciones:POST', error, 'No se ha podido abrir la conversación.');
  }

  const fila = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ id: fila?.id as string, creada: Boolean(fila?.creada) });
}

// Lista las conversaciones de la socia autenticada. La socia no tiene JWT
// `authenticated` de Postgres (su sesión es una cookie/token propio del
// portal, nunca llega a auth.uid() en RLS) — así que esta ruta usa
// service-role y filtra EXPLÍCITAMENTE por su socio_id, nunca confiando en
// que RLS lo haría por ella.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const studioId = searchParams.get('studioId');
  if (!studioId) return errorPeticion('Falta el estudio.');

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data: participaciones, error: errorParticipaciones } = await admin
    .from('conversacion_participantes')
    .select('conversacion_id')
    .eq('socio_id', socioId);
  if (errorParticipaciones) {
    return errorInterno('public/mensajeria/conversaciones:GET', errorParticipaciones, 'No se han podido cargar tus conversaciones.');
  }

  const ids = ((participaciones ?? []) as Pick<RowConversacionParticipantes, 'conversacion_id'>[])
    .map(p => p.conversacion_id);
  if (ids.length === 0) return NextResponse.json({ conversaciones: [] });

  const { data, error } = await admin
    .from('conversaciones')
    .select('id, studio_id, tipo, titulo, ancla_sesion_id, ancla_reserva_id, creado_en, ultimo_mensaje_en')
    .in('id', ids)
    .eq('studio_id', studioId)
    .order('ultimo_mensaje_en', { ascending: false })
    .limit(100);
  if (error) return errorInterno('public/mensajeria/conversaciones:GET', error, 'No se han podido cargar tus conversaciones.');

  return NextResponse.json({ conversaciones: (data ?? []) as RowConversaciones[] });
}

import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { alumnaMenorParaChat, TEXTO_MENOR_CHAT } from '@/lib/moderacion/chat-servidor';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import {
  instantesUltimoMensaje, resumirConversaciones,
  type FilaLectura, type FilaUltimoMensaje,
} from '@/lib/mensajeria/resumen';
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

  // Con una alumna menor de 14, el chat con una instructora no se abre: los
  // mensajes van por el estudio (opción prudente, ver `alumnaMenorParaChat`).
  if (tipo === 'ALUMNA_INSTRUCTORA') {
    try {
      if (await alumnaMenorParaChat(admin, body.studioId, socioId)) {
        return NextResponse.json({ error: TEXTO_MENOR_CHAT, motivo: 'MENOR' }, { status: 409 });
      }
    } catch (e) {
      return errorInterno('public/mensajeria/conversaciones:POST:edad', e, 'No se ha podido abrir la conversación.');
    }
  }

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

// Lista las conversaciones de la socia autenticada. La socia SÍ tiene un JWT
// `authenticated` de Supabase, pero la mensajería no se le abre por PostgREST:
// `es_participante_conversacion` solo cuenta filas del equipo (migr
// 20261006013928), así que todo lo suyo pasa por aquí. Esta ruta usa
// service-role y filtra EXPLÍCITAMENTE por su socio_id: la RLS no la protege.
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

  const filas = (data ?? []) as RowConversaciones[];
  if (filas.length === 0) return NextResponse.json({ conversaciones: [] });

  // Dos consultas más, acotadas a las conversaciones que ya sabemos suyas
  // (`filas`, derivadas de su propio `socio_id`): el último mensaje de cada una
  // y hasta dónde ha leído cada participante.
  const { data: ultimos } = await admin
    .from('mensajes')
    .select('conversacion_id, cuerpo, remitente_auth_user_id, creado_en, oculto_en')
    .in('conversacion_id', filas.map(c => c.id))
    .in('creado_en', instantesUltimoMensaje(filas));

  const { data: lecturasCrudas } = await admin
    .from('conversacion_participantes')
    .select('conversacion_id, auth_user_id, leido_hasta, rol_en_conversacion, socio_id')
    .in('conversacion_id', filas.map(c => c.id));
  // Su marca es la de SU fila SOCIO, la reconozca o no la cuenta: si borró su
  // cuenta y volvió con otra, la fila pudo quedarse sin cuenta (o con la vieja)
  // y el resumen la daría por otra persona (nunca «sin leer»).
  const lecturas = (lecturasCrudas ?? []).map(l => (
    l.rol_en_conversacion === 'SOCIO' && l.socio_id === socioId ? { ...l, auth_user_id: user.userId } : l
  ));

  // Con quién habla en las conversaciones con su instructora: nombre y foto, lo
  // mismo que ya enseña el equipo público del estudio. Nada más de ella.
  const staffPorConversacion = new Map<string, string>();
  for (const l of lecturas ?? []) {
    if (l.rol_en_conversacion === 'STAFF' && l.auth_user_id) {
      staffPorConversacion.set(l.conversacion_id as string, l.auth_user_id as string);
    }
  }
  const instructoraPorUsuario = new Map<string, { nombre: string; fotoUrl: string | null }>();
  const idsStaff = [...new Set(staffPorConversacion.values())];
  if (idsStaff.length > 0) {
    const { data: instructoras } = await admin
      .from('instructores')
      .select('auth_user_id, nombre, foto_url')
      .eq('studio_id', studioId)
      .in('auth_user_id', idsStaff);
    for (const i of instructoras ?? []) {
      if (i.auth_user_id && i.nombre) {
        instructoraPorUsuario.set(i.auth_user_id as string, { nombre: i.nombre as string, fotoUrl: (i.foto_url as string | null) ?? null });
      }
    }
  }

  return NextResponse.json({
    conversaciones: resumirConversaciones(
      filas, (ultimos ?? []) as FilaUltimoMensaje[], (lecturas ?? []) as FilaLectura[], user.userId, 'alumna',
      // Lo que el estudio retiró no se lee en la app, tampoco en la última línea.
      { ocultarRetirados: true },
    ).map(c => ({
      ...c,
      interlocutor: c.tipo === 'ALUMNA_INSTRUCTORA'
        ? instructoraPorUsuario.get(staffPorConversacion.get(c.id) ?? '') ?? null
        : null,
    })),
  });
}

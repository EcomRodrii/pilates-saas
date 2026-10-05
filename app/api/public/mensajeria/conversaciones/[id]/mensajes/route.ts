import { NextRequest, NextResponse, after } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { repartoAvisoMensaje, resolverNombreRemitente } from '@/lib/mensajeria/destinatarios';
import { emitirMensajeRecibido } from '@/lib/notifications/emit';
import { previsualizacionParaAviso } from '@/lib/mensajeria/presentacion';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import {
  TEXTO_NO_ADMITE, errorDeModeracion, estadoDelHilo, mensajeParaApp,
  type EstadoHilo, type ParticipanteHilo,
} from '@/lib/moderacion/reglas';
import { antesDePublicar, cuerpoNoPublicar } from '@/lib/moderacion/normas-servidor';
import type { RowMensajes } from '@/lib/db-types';

const LIMITE_DEFECTO = 50;
const LIMITE_MAXIMO = 100;

// La socia tiene un JWT `authenticated` de Supabase, pero la mensajería no se
// le abre por PostgREST (`es_participante_conversacion` solo cuenta filas del
// equipo, migr 20261005150000): todo pasa por aquí, con service-role, y la RLS
// no la protege. Por eso esta ruta comprueba a mano, ANTES de leer o escribir
// nada, que la socia de la sesión es participante de esta conversación exacta,
// de este estudio.
//
// Dos consultas a la vez: que su ficha (`socio_id`, la misma clave con la que
// `abrir_conversacion` reutiliza el hilo) es la parte alumna, y el hilo de ESTE
// estudio con sus participantes, que dice además si admite mensajes (cerrado o
// bloqueado, migr 20261005150100).
async function hiloDeLaSocia(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  conversacionId: string, socioId: string, studioId: string, authUserId: string,
): Promise<{ estado: EstadoHilo } | null> {
  const [parte, conv] = await Promise.all([
    admin.from('conversacion_participantes')
      .select('conversacion_id')
      .eq('conversacion_id', conversacionId)
      .eq('socio_id', socioId)
      .eq('rol_en_conversacion', 'SOCIO')
      .maybeSingle(),
    admin.from('conversaciones')
      .select('id, tipo, cerrada_en, conversacion_participantes(rol_en_conversacion, auth_user_id, socio_id, bloqueo_en)')
      .eq('id', conversacionId)
      .eq('studio_id', studioId)
      .maybeSingle(),
  ]);
  if (parte.error) throw parte.error;
  if (conv.error) throw conv.error;
  if (!parte.data || !conv.data) return null;
  return {
    estado: estadoDelHilo({
      tipo: conv.data.tipo as string, cerradaEn: conv.data.cerrada_en as string | null,
      participantes: (conv.data.conversacion_participantes ?? []) as ParticipanteHilo[],
      yo: { socioId, authUserId },
    }),
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { searchParams } = new URL(req.url);
  const studioId = searchParams.get('studioId');
  if (!studioId) return errorPeticion('Falta el estudio.');

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  let hilo: { estado: EstadoHilo } | null;
  try {
    hilo = await hiloDeLaSocia(admin, id, socioId, studioId, user.userId);
  } catch (e) {
    return errorInterno('public/mensajeria/mensajes:GET', e, 'No se han podido cargar los mensajes.');
  }
  if (!hilo) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const antes = searchParams.get('antes');
  const limiteParam = Number(searchParams.get('limite'));
  const limite = Number.isFinite(limiteParam) && limiteParam > 0
    ? Math.min(limiteParam, LIMITE_MAXIMO)
    : LIMITE_DEFECTO;

  let query = admin
    .from('mensajes')
    .select('id, conversacion_id, studio_id, remitente_auth_user_id, cuerpo, creado_en, oculto_en')
    .eq('conversacion_id', id)
    .order('creado_en', { ascending: false })
    .limit(limite);
  if (antes) query = query.lt('creado_en', antes);

  const { data, error } = await query;
  if (error) return errorInterno('public/mensajeria/mensajes:GET', error, 'No se han podido cargar los mensajes.');

  // Lo retirado por el estudio sale sin su texto, también a quien lo escribió.
  // `estado` es aditivo: dice si el hilo admite mensajes (la app de antes lo ignora).
  const mensajes = ((data ?? []) as RowMensajes[]).slice().reverse().map(mensajeParaApp);
  return NextResponse.json({ mensajes, estado: hilo.estado });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'public-mensajeria-mensajes', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { studioId?: string; cuerpo?: string } | null;
  const cuerpo = body?.cuerpo?.trim();
  if (!body?.studioId) return errorPeticion('Falta el estudio.');
  if (!cuerpo || cuerpo.length < 1 || cuerpo.length > 4000) {
    return errorPeticion('El mensaje debe tener entre 1 y 4000 caracteres.');
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, body.studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  let hilo: { estado: EstadoHilo } | null;
  try {
    hilo = await hiloDeLaSocia(admin, id, socioId, body.studioId, user.userId);
  } catch (e) {
    return errorInterno('public/mensajeria/mensajes:POST', e, 'No se ha podido enviar el mensaje.');
  }
  if (!hilo) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  // Cerrado o bloqueado: ni se intenta. Si cambia entre esta lectura y el INSERT,
  // lo para el trigger de la base de datos (abajo, el mismo 409).
  if (hilo.estado !== 'ABIERTA') {
    return NextResponse.json({ error: TEXTO_NO_ADMITE, estado: hilo.estado }, { status: 409 });
  }
  // Normas aceptadas y filtro de palabras (App Store 1.2), antes de guardar nada.
  try {
    const motivo = await antesDePublicar(admin, user.userId, cuerpo);
    if (motivo) return NextResponse.json(cuerpoNoPublicar(motivo), { status: motivo.status });
  } catch (e) {
    return errorInterno('public/mensajeria/mensajes:POST:normas', e, 'No se ha podido enviar el mensaje.');
  }

  const { data, error } = await admin
    .from('mensajes')
    .insert({
      id: `msg-${crypto.randomUUID()}`,
      conversacion_id: id,
      studio_id: body.studioId,
      remitente_auth_user_id: user.userId,
      cuerpo,
    })
    .select('id, conversacion_id, studio_id, remitente_auth_user_id, cuerpo, creado_en')
    .single();

  if (error) {
    const moderacion = errorDeModeracion(error);
    if (moderacion) return NextResponse.json({ error: moderacion.error, estado: moderacion.estado }, { status: 409 });
    return errorInterno('public/mensajeria/mensajes:POST', error, 'No se ha podido enviar el mensaje.');
  }

  // Best-effort, igual que en el lado staff, y por el mismo motivo movido a
  // `after()`: la socia ya tiene su mensaje guardado en este punto, no debe
  // esperar a que se resuelvan destinatarios + notificación + entrega externa.
  const mensajeId = (data as RowMensajes).id;
  after(async () => {
    try {
      const { data: conv } = await admin.from('conversaciones')
        .select('tipo, studio_id').eq('id', id).maybeSingle();
      if (!conv) return;
      // Cada uno con su papel en el hilo, no con lo que sea su cuenta.
      const reparto = await repartoAvisoMensaje(
        admin, { id, tipo: conv.tipo as string, studio_id: conv.studio_id as string }, user.userId,
      );
      if (reparto.authUserIds.length === 0) return;
      // A su instructora le llega «Lucía M.», como la ve en su app; al mostrador, el nombre entero.
      const remitente = (await resolverNombreRemitente(
        admin, user.userId, conv.studio_id as string, { corto: conv.tipo === 'ALUMNA_INSTRUCTORA' },
      )) ?? 'Alguien';
      await emitirMensajeRecibido(admin, {
        studioId: conv.studio_id as string, conversacionId: id, mensajeId,
        remitente, previsualizacion: previsualizacionParaAviso(conv.tipo as string, cuerpo),
        authUserIds: reparto.authUserIds, recipients: reparto.recipients, socioId: reparto.socioId,
        tipo: conv.tipo as string,
      });
    } catch (e) {
      console.error('[public/mensajeria/mensajes:POST] fan-out tras respuesta falló', e instanceof Error ? e.message : e);
    }
  });

  return NextResponse.json({ mensaje: data as RowMensajes });
}

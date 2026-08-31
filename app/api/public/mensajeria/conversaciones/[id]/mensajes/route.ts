import { NextRequest, NextResponse, after } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { authUserIdsParaNotificar, resolverNombreRemitente } from '@/lib/mensajeria/destinatarios';
import { emitirMensajeRecibido } from '@/lib/notifications/emit';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import type { RowMensajes } from '@/lib/db-types';

const LIMITE_DEFECTO = 50;
const LIMITE_MAXIMO = 100;

// La socia no llega a `auth.uid()` (sin JWT `authenticated` de Postgres), así
// que aquí no hay RLS que la proteja: toda esta ruta comprueba a mano, ANTES
// de leer o escribir nada, que la socia de la sesión es participante de esta
// conversación exacta.
async function esParticipante(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  conversacionId: string, socioId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('conversacion_participantes')
    .select('conversacion_id')
    .eq('conversacion_id', conversacionId)
    .eq('socio_id', socioId)
    .maybeSingle();
  return Boolean(data);
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
  if (!(await esParticipante(admin, id, socioId))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const antes = searchParams.get('antes');
  const limiteParam = Number(searchParams.get('limite'));
  const limite = Number.isFinite(limiteParam) && limiteParam > 0
    ? Math.min(limiteParam, LIMITE_MAXIMO)
    : LIMITE_DEFECTO;

  let query = admin
    .from('mensajes')
    .select('id, conversacion_id, studio_id, remitente_auth_user_id, cuerpo, creado_en')
    .eq('conversacion_id', id)
    .order('creado_en', { ascending: false })
    .limit(limite);
  if (antes) query = query.lt('creado_en', antes);

  const { data, error } = await query;
  if (error) return errorInterno('public/mensajeria/mensajes:GET', error, 'No se han podido cargar los mensajes.');

  const mensajes = ((data ?? []) as RowMensajes[]).slice().reverse();
  return NextResponse.json({ mensajes });
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
  if (!(await esParticipante(admin, id, socioId))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
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

  if (error) return errorInterno('public/mensajeria/mensajes:POST', error, 'No se ha podido enviar el mensaje.');

  // Best-effort, igual que en el lado staff, y por el mismo motivo movido a
  // `after()`: la socia ya tiene su mensaje guardado en este punto, no debe
  // esperar a que se resuelvan destinatarios + notificación + entrega externa.
  const mensajeId = (data as RowMensajes).id;
  after(async () => {
    try {
      const { data: conv } = await admin.from('conversaciones')
        .select('tipo, studio_id').eq('id', id).maybeSingle();
      if (!conv) return;
      const authUserIds = await authUserIdsParaNotificar(
        admin, { id, tipo: conv.tipo as string, studio_id: conv.studio_id as string }, user.userId,
      );
      if (authUserIds.length === 0) return;
      const remitente = (await resolverNombreRemitente(admin, user.userId, conv.studio_id as string)) ?? 'Alguien';
      await emitirMensajeRecibido(admin, {
        studioId: conv.studio_id as string, conversacionId: id, mensajeId,
        remitente, previsualizacion: cuerpo.slice(0, 80), authUserIds,
      });
    } catch (e) {
      console.error('[public/mensajeria/mensajes:POST] fan-out tras respuesta falló', e instanceof Error ? e.message : e);
    }
  });

  return NextResponse.json({ mensaje: data as RowMensajes });
}

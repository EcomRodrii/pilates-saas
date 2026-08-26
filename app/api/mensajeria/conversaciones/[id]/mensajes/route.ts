import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { authUserIdsParaNotificar, resolverNombreRemitente } from '@/lib/mensajeria/destinatarios';
import { emitirMensajeRecibido } from '@/lib/notifications/emit';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import type { RowMensajes } from '@/lib/db-types';

const LIMITE_DEFECTO = 50;
const LIMITE_MAXIMO = 100;

function sesionCliente(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

// Lista mensajes de una conversación, paginado por cursor simple (`antes`).
// Cliente de SESIÓN (no service-role): la policy `mensajes_lectura` ya exige
// participación (o EQUIPO/ALUMNA_MOSTRADOR con puede_gestionar_calendario()),
// así que una conversación ajena simplemente devuelve 0 filas, sin más
// comprobación que hacer aquí.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const antes = searchParams.get('antes');
  const limiteParam = Number(searchParams.get('limite'));
  const limite = Number.isFinite(limiteParam) && limiteParam > 0
    ? Math.min(limiteParam, LIMITE_MAXIMO)
    : LIMITE_DEFECTO;

  let query = sesionCliente(token)
    .from('mensajes')
    .select('id, conversacion_id, studio_id, remitente_auth_user_id, cuerpo, creado_en')
    .eq('conversacion_id', id)
    .order('creado_en', { ascending: false })
    .limit(limite);
  if (antes) query = query.lt('creado_en', antes);

  const { data, error } = await query;
  if (error) return errorInterno('mensajeria:mensajes:GET', error, 'No se han podido cargar los mensajes.');

  const mensajes = ((data ?? []) as RowMensajes[]).slice().reverse();
  return NextResponse.json({ mensajes });
}

// Envía un mensaje. Inserta con el cliente de SESIÓN del usuario: la policy
// `mensajes_escritura` ya exige `remitente_auth_user_id = auth.uid()` Y
// participación (o EQUIPO/ALUMNA_MOSTRADOR con permiso) — dejar que RLS lo
// valide es más simple y más seguro que reimplementarlo en TS con
// service-role.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  // Mismo criterio que el lado portal (hallazgo de tentare-seguridad tras el
  // P0): un token de staff robado no debe poder inundar de mensajes sin freno.
  const limited = await enforceRateLimit(req, 'staff-mensajeria-mensajes', { max: 120, windowSeconds: 60 }, sesion.userId);
  if (limited) return limited;

  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null) as { cuerpo?: string } | null;
  const cuerpo = body?.cuerpo?.trim();
  if (!cuerpo || cuerpo.length < 1 || cuerpo.length > 4000) {
    return errorPeticion('El mensaje debe tener entre 1 y 4000 caracteres.');
  }

  const { data, error } = await sesionCliente(token)
    .from('mensajes')
    .insert({
      id: `msg-${crypto.randomUUID()}`,
      conversacion_id: id,
      studio_id: sesion.studioId,
      remitente_auth_user_id: sesion.userId,
      cuerpo,
    })
    .select('id, conversacion_id, studio_id, remitente_auth_user_id, cuerpo, creado_en')
    .single();

  if (error) {
    // RLS deniega el INSERT (no participa en la conversación, o no es su
    // studio): PostgREST lo reporta como 42501/violación de policy, nunca
    // como un fallo de servidor genuino — se lo decimos claro a quien escribe.
    if (error.code === '42501' || error.message.toLowerCase().includes('row-level security')) {
      return NextResponse.json({ error: 'No tienes acceso a esta conversación.' }, { status: 403 });
    }
    return errorInterno('mensajeria:mensajes:POST', error, 'No se ha podido enviar el mensaje.');
  }

  // Notificar es best-effort (emitirMensajeRecibido ya envuelve en try/catch):
  // un fallo aquí nunca debe deshacer un mensaje que ya se guardó.
  const admin = getSupabaseAdmin();
  if (admin) {
    const { data: conv } = await admin.from('conversaciones')
      .select('tipo, studio_id').eq('id', id).maybeSingle();
    if (conv) {
      const authUserIds = await authUserIdsParaNotificar(
        admin, { id, tipo: conv.tipo as string, studio_id: conv.studio_id as string }, sesion.userId,
      );
      if (authUserIds.length > 0) {
        const remitente = (await resolverNombreRemitente(admin, sesion.userId, conv.studio_id as string)) ?? 'Alguien';
        await emitirMensajeRecibido(admin, {
          studioId: conv.studio_id as string, conversacionId: id, mensajeId: (data as RowMensajes).id,
          remitente, previsualizacion: cuerpo.slice(0, 80), authUserIds,
        });
      }
    }
  }

  return NextResponse.json({ mensaje: data as RowMensajes });
}

import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase, verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { uid } from '@/lib/utils';
import type { MensajeNetwork } from '@/lib/network/tipos';

// Mensajería interna (brief §9) — un hilo por solicitud de contacto YA
// ACEPTADA. Dos vías de auth completamente distintas conviven en Network
// (staff de estudio vs. cuenta de instructora sin estudio,
// docs/NETWORK-AUDIT-2.md §4), así que esta ruta resuelve las DOS: quien
// pide el hilo es o bien staff del estudio de la solicitud, o bien la
// dueña del perfil — nunca un tercero. Mismo criterio que ya cierra la RLS
// de la tabla (20260813183513); aquí se repite en TS porque hace falta
// además resolver "esta persona escribió el mensaje" para pintar burbujas
// propias/ajenas, que la RLS no puede decir.
async function resolverParticipante(req: NextRequest, admin: ReturnType<typeof getSupabaseAdmin>) {
  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario || !admin) return null;

  const solicitudId = req.nextUrl.searchParams.get('solicitudId')
    ?? (await req.clone().json().catch(() => null))?.solicitudId;
  if (typeof solicitudId !== 'string') return null;

  const { data: solicitud } = await admin
    .from('red_solicitudes_contacto')
    .select('id, perfil_id, studio_id, estado, red_perfiles ( auth_user_id )')
    .eq('id', solicitudId).eq('estado', 'aceptada').maybeSingle();
  if (!solicitud) return null;

  const perfil = solicitud.red_perfiles as unknown as { auth_user_id: string } | null;
  if (perfil?.auth_user_id === usuario.userId) {
    return { userId: usuario.userId, solicitudId, autorizado: true };
  }

  const sesionStaff = await verificarSesionStaff(req);
  if (sesionStaff && sesionStaff.studioId === solicitud.studio_id) {
    return { userId: usuario.userId, solicitudId, autorizado: true };
  }

  return { userId: usuario.userId, solicitudId, autorizado: false };
}

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const participante = await resolverParticipante(req, admin);
  if (!participante) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!participante.autorizado) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { data, error } = await admin
    .from('red_mensajes').select('id, cuerpo, remitente, creado_en, leido_en')
    .eq('solicitud_id', participante.solicitudId).order('creado_en', { ascending: true });
  if (error) return errorInterno('network:mensajes:GET', error, 'No se han podido cargar los mensajes.');

  // Marcar como leídos los que no son míos — un GET del destinatario es
  // justo el momento en que "los lee". Fire-and-forget: no bloquea la
  // respuesta, y si falla no hay nada que decirle al usuario por esto.
  const idsAjenosSinLeer = (data ?? [])
    .filter(m => m.remitente !== participante.userId && !m.leido_en)
    .map(m => m.id as string);
  if (idsAjenosSinLeer.length > 0) {
    void admin.from('red_mensajes').update({ leido_en: new Date().toISOString() }).in('id', idsAjenosSinLeer);
  }

  const mensajes: MensajeNetwork[] = (data ?? []).map(m => ({
    id: m.id as string,
    cuerpo: m.cuerpo as string,
    remitenteSoyYo: m.remitente === participante.userId,
    creadoEn: m.creado_en as string,
    leidoEn: (m.leido_en as string | null) ?? null,
  }));

  return NextResponse.json({ mensajes });
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = (await req.clone().json().catch(() => null)) as { solicitudId?: unknown; cuerpo?: unknown } | null;
  const cuerpo = typeof body?.cuerpo === 'string' ? body.cuerpo.trim() : '';
  if (!cuerpo) return errorPeticion('El mensaje no puede estar vacío.');

  const participante = await resolverParticipante(req, admin);
  if (!participante) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!participante.autorizado) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { error } = await admin.from('red_mensajes').insert({
    id: `redmsg-${uid()}`, solicitud_id: participante.solicitudId, remitente: participante.userId, cuerpo,
  });
  if (error) return errorInterno('network:mensajes:POST', error, 'No se ha podido enviar el mensaje.');

  return NextResponse.json({ ok: true });
}

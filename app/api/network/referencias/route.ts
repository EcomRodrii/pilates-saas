import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { uid } from '@/lib/utils';
import { mapFilaAReferencia, type FilaRedReferencia } from '@/lib/network/mapeo';
import { enviarEmailReferenciaSolicitud } from '@/lib/emails/referencia-solicitud-server';

// Referencias profesionales — pieza que faltaba de la migración
// 20260813111231 (docs/NETWORK-IMPLEMENTATION-PLAN.md §5/§9): la tabla y su
// RLS de dueña ya existían, pero nadie creaba filas ni las resolvía. El
// referente confirma/rechaza SIN cuenta, por token, en
// app/api/public/network/referencia (service-role) — este endpoint solo crea
// la solicitud y manda el email.

const COLUMNAS = 'id, perfil_id, nombre_referente, email_referente, relacion, estado, solicitado_en, resuelto_en';
const TOKEN_VALIDEZ_DIAS = 7;

async function propioPerfil(admin: ReturnType<typeof getSupabaseAdmin>, authUserId: string): Promise<{ id: string; nombre: string } | null> {
  const { data } = await admin!.from('red_perfiles').select('id, nombre').eq('auth_user_id', authUserId).maybeSingle();
  return data as { id: string; nombre: string } | null;
}

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const perfil = await propioPerfil(admin, usuario.userId);
  if (!perfil) return NextResponse.json({ referencias: [] });

  const { data, error } = await admin
    .from('red_referencias')
    .select(COLUMNAS)
    .eq('perfil_id', perfil.id)
    .order('solicitado_en', { ascending: false });
  if (error) return errorInterno('network:referencias:GET', error, 'No se han podido cargar tus referencias.');

  return NextResponse.json({ referencias: (data as unknown as FilaRedReferencia[]).map(mapFilaAReferencia) });
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const perfil = await propioPerfil(admin, usuario.userId);
  if (!perfil) return errorPeticion('Crea tu perfil antes de pedir una referencia.', 404);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return errorPeticion('Petición inválida.');

  const nombreReferente = String(body.nombreReferente ?? '').trim();
  if (!nombreReferente) return errorPeticion('Indica el nombre del referente.');

  const emailReferente = String(body.emailReferente ?? '').trim().toLowerCase();
  if (!emailReferente || !emailReferente.includes('@')) return errorPeticion('Indica un email válido.');

  const relacion = body.relacion == null || body.relacion === '' ? null : String(body.relacion).trim();

  const token = crypto.randomUUID();
  const tokenExpiraEn = new Date(Date.now() + TOKEN_VALIDEZ_DIAS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from('red_referencias')
    .insert({
      id: `redref-${uid()}`,
      perfil_id: perfil.id,
      nombre_referente: nombreReferente,
      email_referente: emailReferente,
      relacion,
      token,
      token_expira_en: tokenExpiraEn,
    })
    .select(COLUMNAS)
    .single();
  if (error) return errorInterno('network:referencias:POST', error, 'No se ha podido guardar la solicitud.');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  await enviarEmailReferenciaSolicitud({
    to: emailReferente,
    nombreReferente,
    profesionalNombre: perfil.nombre,
    relacion,
    url: `${appUrl}/network/referencia/${token}`,
  });

  return NextResponse.json({ referencia: mapFilaAReferencia(data as unknown as FilaRedReferencia) });
}

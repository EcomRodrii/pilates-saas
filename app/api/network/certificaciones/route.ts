import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { uid } from '@/lib/utils';
import { mapFilaACertificacion, type FilaRedCertificacion } from '@/lib/network/mapeo';

// Paso 06 del wizard ("Formación") — CRUD de certificaciones. Mismo patrón
// que /api/network/experiencia: solo POST/DELETE (sin PATCH, no se edita
// una certificación ya enviada — se retira mientras está pendiente y se
// vuelve a subir). El documento ya está en el bucket privado antes de
// llamar aquí, igual que la verificación de identidad.

const SELECT_COLUMNAS = 'id, perfil_id, nombre, institucion, anio, duracion, documento_path, estado, motivo_rechazo, creado_en';

async function propioPerfilId(admin: ReturnType<typeof getSupabaseAdmin>, authUserId: string): Promise<string | null> {
  const { data } = await admin!.from('red_perfiles').select('id').eq('auth_user_id', authUserId).maybeSingle();
  return data?.id ?? null;
}

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const perfilId = await propioPerfilId(admin, usuario.userId);
  if (!perfilId) return NextResponse.json({ certificaciones: [] });

  const { data, error } = await admin
    .from('red_certificaciones')
    .select(SELECT_COLUMNAS)
    .eq('perfil_id', perfilId)
    .order('creado_en', { ascending: false });
  if (error) return errorInterno('network:certificaciones:GET', error, 'No se han podido cargar tus certificaciones.');

  return NextResponse.json({ certificaciones: (data as unknown as FilaRedCertificacion[]).map(mapFilaACertificacion) });
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const perfilId = await propioPerfilId(admin, usuario.userId);
  if (!perfilId) return errorPeticion('Crea tu perfil (paso 1) antes de continuar.', 404);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return errorPeticion('Petición inválida.');

  const nombre = String(body.nombre ?? '').trim();
  if (!nombre) return errorPeticion('Indica el nombre de la certificación.');
  const institucion = String(body.institucion ?? '').trim();
  if (!institucion) return errorPeticion('Indica la institución.');

  const anio = body.anio == null || body.anio === '' ? null : Number(body.anio);
  if (anio != null && (!Number.isFinite(anio) || anio < 1950 || anio > new Date().getFullYear())) {
    return errorPeticion('El año no es válido.');
  }
  const duracion = body.duracion == null || body.duracion === '' ? null : String(body.duracion).trim();

  const documentoPath = typeof body.documentoPath === 'string' ? body.documentoPath : '';
  if (!documentoPath) return errorPeticion('Falta el documento subido.');
  if (!documentoPath.startsWith(`${usuario.userId}/`)) return errorPeticion('Ruta de documento no válida.');

  const { data, error } = await admin
    .from('red_certificaciones')
    .insert({ id: `redcert-${uid()}`, perfil_id: perfilId, nombre, institucion, anio, duracion, documento_path: documentoPath })
    .select(SELECT_COLUMNAS)
    .single();
  if (error) return errorInterno('network:certificaciones:POST', error, 'No se ha podido guardar la certificación.');

  return NextResponse.json({ certificacion: mapFilaACertificacion(data as unknown as FilaRedCertificacion) });
}

export async function DELETE(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : null;
  if (!id) return errorPeticion('Falta el id.');

  const perfilId = await propioPerfilId(admin, usuario.userId);
  if (!perfilId) return errorPeticion('No tienes ningún perfil.', 404);

  // Solo mientras 'pendiente' — mismo guard que la RLS
  // (red_certificaciones_delete_propio_pendiente), aquí explícito para dar
  // un mensaje claro en vez de un error genérico de la BD.
  const { error, count } = await admin
    .from('red_certificaciones')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('perfil_id', perfilId)
    .eq('estado', 'pendiente');
  if (error) return errorInterno('network:certificaciones:DELETE', error, 'No se ha podido eliminar la certificación.');
  if (!count) return errorPeticion('Solo puedes retirar una certificación mientras está pendiente de revisión.');

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { uid } from '@/lib/utils';
import { mapFilaAVerificacionIdentidad, type FilaRedVerificacionIdentidad } from '@/lib/network/mapeo';

// Paso 02 del wizard — solicitud de verificación de identidad por
// documento. El documento en sí ya está subido al bucket privado
// red-documentos-identidad ANTES de llamar aquí (lib/network/
// documentos-identidad.ts, subida directa del cliente vía RLS de
// storage.objects); este endpoint solo registra la fila que referencia esa
// ruta y la deja 'pendiente'. Revisar/aprobar/rechazar es Fase 3
// (Tentare Interno), no aquí — este endpoint nunca escribe `estado` a otra
// cosa que 'pendiente'.

const SELECT_COLUMNAS = 'id, perfil_id, estado, motivo_rechazo, documento_path, creado_en, resuelto_en';

async function propioPerfilId(admin: ReturnType<typeof getSupabaseAdmin>, authUserId: string): Promise<string | null> {
  const { data } = await admin!.from('red_perfiles').select('id').eq('auth_user_id', authUserId).maybeSingle();
  return data?.id ?? null;
}

// La verificación "viva" (más reciente) del perfil — puede que ninguna, o
// que la última esté 'rechazada' (y entonces el wizard ofrece volver a
// subir, que crea una fila nueva, no la edita).
export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const perfilId = await propioPerfilId(admin, usuario.userId);
  if (!perfilId) return NextResponse.json({ verificacion: null });

  const { data, error } = await admin
    .from('red_verificaciones_identidad')
    .select(SELECT_COLUMNAS)
    .eq('perfil_id', perfilId)
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return errorInterno('network:verificacion-identidad:GET', error, 'No se ha podido cargar el estado de tu verificación.');

  return NextResponse.json({
    verificacion: data ? mapFilaAVerificacionIdentidad(data as unknown as FilaRedVerificacionIdentidad) : null,
  });
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const perfilId = await propioPerfilId(admin, usuario.userId);
  if (!perfilId) return errorPeticion('Crea tu perfil (paso 1) antes de continuar.', 404);

  const body = (await req.json().catch(() => null)) as { documentoPath?: unknown } | null;
  const documentoPath = typeof body?.documentoPath === 'string' ? body.documentoPath : '';
  if (!documentoPath) return errorPeticion('Falta el documento subido.');
  // El path lo sube el propio dueño a su carpeta (RLS de storage.objects
  // exige que el primer segmento sea su auth.uid()) — se revalida aquí para
  // no confiar en lo que mande el cliente sin más.
  if (!documentoPath.startsWith(`${usuario.userId}/`)) return errorPeticion('Ruta de documento no válida.');

  // Solo una fila "viva" a la vez (índice único parcial en la migración) —
  // si ya hay una pendiente/en_revision, no se crea otra; el wizard debe
  // esperar a que se resuelva. Un rechazo previo SÍ permite una nueva.
  const { data: viva } = await admin
    .from('red_verificaciones_identidad')
    .select('id, estado')
    .eq('perfil_id', perfilId)
    .in('estado', ['pendiente', 'en_revision'])
    .maybeSingle();
  if (viva) return errorPeticion('Ya tienes una verificación en curso.');

  const { data, error } = await admin
    .from('red_verificaciones_identidad')
    .insert({ id: `redveri-${uid()}`, perfil_id: perfilId, documento_path: documentoPath })
    .select(SELECT_COLUMNAS)
    .single();
  if (error) return errorInterno('network:verificacion-identidad:POST', error, 'No se ha podido enviar tu documento.');

  return NextResponse.json({ verificacion: mapFilaAVerificacionIdentidad(data as unknown as FilaRedVerificacionIdentidad) });
}

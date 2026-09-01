import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { puedeGestionarClientas } from '@/lib/permisos-reglas';

const BUCKET = 'documentos-socio';
const CADUCIDAD_URL_SEGUNDOS = 60;

// Auditoría 20ª pasada (F-14): el estudio subía documentos a una socia y no
// podía volver a abrirlos — `ficha-documentos.tsx` no tenía ni un `<a href>`
// ni llamaba a `createSignedUrl`; la única firma existía en
// app/api/public/documentos-socio, solo para la socia dueña. El bucket no
// tiene policy de SELECT para NADIE (migración 20260826200010), así que la
// única forma de leer un documento es una URL firmada con service-role,
// igual que ya hace la ruta pública para la socia.
//
// Mismo criterio de acceso que el resto de la ficha (subir/listar/borrar):
// `puedeGestionarClientas`, sin distinguir "quién lo subió" — es el gate ya
// establecido para toda esta sección, no una decisión nueva.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para ver documentos de una socia.' }, { status: 403 });
  }

  const { id } = await params;

  const { data: doc, error } = await admin
    .from('documentos_socio')
    .select('storage_path')
    .eq('id', id)
    .eq('studio_id', sesion.studioId)
    .is('borrado_en', null)
    .maybeSingle();
  if (error) return errorInterno('documentos-socio:id:GET', error, 'No se ha podido abrir el documento.');
  if (!doc) return NextResponse.json({ error: 'Ese documento no existe o se ha borrado.' }, { status: 404 });

  const { data: firmada, error: errorFirma } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, CADUCIDAD_URL_SEGUNDOS);
  if (errorFirma || !firmada) {
    return errorInterno('documentos-socio:id:GET:firma', errorFirma ?? new Error('sin URL firmada'), 'No se ha podido abrir el documento.');
  }

  return NextResponse.json({ url: firmada.signedUrl });
}

// Soft-delete (`borrado_en`), mismo patrón que `socios` (migración 0011): se
// conserva la fila y el archivo en Storage (auditoría de qué se subió), solo
// deja de listarse. Nunca un DELETE físico ni de la fila ni del objeto.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para eliminar este documento.' }, { status: 403 });
  }

  const { id } = await params;

  // Acotado SIEMPRE por studio_id, nunca solo por id — mismo criterio que
  // el resto de rutas de detalle de este repo (network/vacantes/[id], etc.).
  const { data, error } = await admin
    .from('documentos_socio')
    .update({ borrado_en: new Date().toISOString() })
    .eq('id', id)
    .eq('studio_id', sesion.studioId)
    .is('borrado_en', null)
    .select('id')
    .maybeSingle();
  if (error) return errorInterno('documentos-socio:id:DELETE', error, 'No se ha podido eliminar el documento.');
  if (!data) return NextResponse.json({ error: 'Ese documento no existe o ya se eliminó.' }, { status: 404 });

  return NextResponse.json({ ok: true });
}

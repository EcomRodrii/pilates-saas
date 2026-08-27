import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { puedeGestionarClientas } from '@/lib/permisos-reglas';

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

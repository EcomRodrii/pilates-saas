import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarClientas } from '@/lib/permisos-reglas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';

// Borrar un contacto apuntado por error. Solo lo puede borrar quien lo apuntó,
// o la propietaria; y solo filas `tipo = 'contacto'`: los correos que mandó el
// sistema no se borran desde aquí (son la prueba de lo que salió).
//
// `.select('id')`: un DELETE que no encuentra la fila no da error, afecta a 0.
// Sin comprobarlo, la pantalla diría «borrado» de algo que sigue ahí.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; contactoId: string }> }) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para borrar contactos con clientas.' }, { status: 403 });
  }
  const limited = await enforceRateLimit(req, 'socios-contactos', { max: 60, windowSeconds: 60 }, sesion.studioId);
  if (limited) return limited;

  const { id: socioId, contactoId } = await params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    let q = admin.from('comunicaciones_socio').delete()
      .eq('id', contactoId).eq('studio_id', sesion.studioId).eq('socio_id', socioId).eq('tipo', 'contacto');
    if (sesion.rol !== 'PROPIETARIO') q = q.eq('creado_por', sesion.userId);
    const { data, error } = await q.select('id');
    if (error) return errorInterno('socios:contactos:borrar', error, 'No se ha podido borrar el contacto. Vuelve a intentarlo.');
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Este contacto no existe o lo apuntó otra persona: solo lo puede borrar ella o la propietaria.' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorInterno('socios:contactos:borrar', e, 'No se ha podido borrar el contacto. Vuelve a intentarlo.');
  }
}

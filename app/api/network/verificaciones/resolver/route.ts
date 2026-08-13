import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';
import { emitirRedExperienciaConfirmada, emitirRedExperienciaRechazada } from '@/lib/notifications/emit';

// Confirmar/rechazar una experiencia — docs/NETWORK-IMPLEMENTATION-PLAN.md §4.
// Auditable por diseño: resuelto_en/resuelto_por, mismo criterio que
// `resolver_reserva_pendiente` (Fase 2a de reservas).
export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarEquipo(sesion.rol)) return NextResponse.json({ error: 'No tienes permiso para resolver esto' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { id?: unknown; aprobar?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : null;
  const aprobar = typeof body?.aprobar === 'boolean' ? body.aprobar : null;
  if (!id || aprobar == null) return errorPeticion('Faltan datos.');

  const { data: verificacion } = await admin
    .from('red_verificaciones_experiencia')
    .select('id, experiencia_id, studio_id, estado')
    .eq('id', id)
    .eq('studio_id', sesion.studioId) // nunca resolver una solicitud de OTRO estudio
    .maybeSingle();
  if (!verificacion) return errorPeticion('Solicitud no encontrada.', 404);
  if (verificacion.estado !== 'pendiente') return errorPeticion('Esta solicitud ya se resolvió.');

  const { data: experiencia } = await admin
    .from('red_experiencias')
    .select('id, perfil_id, nombre_estudio, red_perfiles ( auth_user_id, nombre )')
    .eq('id', verificacion.experiencia_id)
    .maybeSingle();
  const perfil = (experiencia?.red_perfiles ?? null) as { auth_user_id: string; nombre: string } | null;

  const ahora = new Date().toISOString();
  const { error: errVer } = await admin
    .from('red_verificaciones_experiencia')
    .update({ estado: aprobar ? 'confirmada' : 'rechazada', resuelto_en: ahora, resuelto_por: sesion.userId })
    .eq('id', id);
  if (errVer) return errorInterno('network:verificaciones:resolver:ver', errVer, 'No se ha podido resolver la solicitud.');

  const { error: errExp } = await admin
    .from('red_experiencias')
    .update({ estado_verificacion: aprobar ? 'confirmada' : 'rechazada' })
    .eq('id', verificacion.experiencia_id);
  if (errExp) return errorInterno('network:verificaciones:resolver:exp', errExp, 'No se ha podido resolver la solicitud.');

  if (perfil?.auth_user_id) {
    const datos = {
      studioId: sesion.studioId,
      authUserId: perfil.auth_user_id,
      profesional: perfil.nombre,
      estudio: experiencia?.nombre_estudio ?? sesion.nombre,
      experienciaId: verificacion.experiencia_id,
    };
    if (aprobar) await emitirRedExperienciaConfirmada(admin, datos);
    else await emitirRedExperienciaRechazada(admin, datos);
  }

  return NextResponse.json({ ok: true });
}

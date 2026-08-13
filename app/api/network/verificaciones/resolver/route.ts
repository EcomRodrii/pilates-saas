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

  // red_resolver_verificacion_experiencia (migr 20260813135453): ambos UPDATE
  // (la solicitud de verificación y la experiencia) en una sola transacción
  // — antes eran dos escrituras secuenciales, y si la segunda fallaba la
  // solicitud quedaba resuelta pero la experiencia seguía 'pendiente' para
  // siempre (experiencia/verificar bloquea una nueva solicitud en ese estado).
  const { data: filas, error: errResolver } = await admin.rpc('red_resolver_verificacion_experiencia', {
    p_verificacion_id: id,
    p_studio_id: sesion.studioId,
    p_aprobar: aprobar,
    p_resuelto_por: sesion.userId,
  });
  if (errResolver) {
    if (errResolver.message?.includes('VERIFICACION_NO_ENCONTRADA')) return errorPeticion('Solicitud no encontrada.', 404);
    if (errResolver.message?.includes('YA_RESUELTA')) return errorPeticion('Esta solicitud ya se resolvió.');
    return errorInterno('network:verificaciones:resolver', errResolver, 'No se ha podido resolver la solicitud.');
  }
  const resultado = (filas as { experiencia_id: string; perfil_auth_user_id: string; perfil_nombre: string; nombre_estudio: string }[] | null)?.[0];

  if (resultado?.perfil_auth_user_id) {
    const datos = {
      studioId: sesion.studioId,
      authUserId: resultado.perfil_auth_user_id,
      profesional: resultado.perfil_nombre,
      estudio: resultado.nombre_estudio,
      experienciaId: resultado.experiencia_id,
    };
    if (aprobar) await emitirRedExperienciaConfirmada(admin, datos);
    else await emitirRedExperienciaRechazada(admin, datos);
  }

  return NextResponse.json({ ok: true });
}

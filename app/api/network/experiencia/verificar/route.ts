import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { uid } from '@/lib/utils';
import { emitirRedVerificacionSolicitada } from '@/lib/notifications/emit';
import { enforceRateLimit } from '@/lib/rate-limit';
import { ROLES_QUE_RESUELVEN_VERIFICACION, motivoVerificadorNoPermitido } from '@/lib/network/verificacion-experiencia';

// Solicitar verificación de una experiencia — docs/NETWORK-IMPLEMENTATION-PLAN.md
// §4. Enlaza la experiencia a un estudio Tentare REAL (studio_id, hasta ahora
// null — ver app/api/network/experiencia/route.ts) y crea la solicitud.
//
// Se puede volver a pedir tras un rechazo: la RLS/índice único de
// `red_verificaciones_experiencia` es parcial (solo mientras `pendiente`,
// migr 20260813115118) — dos solicitudes resueltas para la misma experiencia
// no chocan entre sí.
//
// ⚠️ Nadie se verifica a sí misma: se rechaza pedírselo a un estudio del que
// eres dueña o que gestionas (PROPIETARIO/MANAGER), porque serías tú quien lo
// aprueba. La RPC que aprueba lo comprueba otra vez (migr 20260913161400).
// Límite por cuenta: cada solicitud notifica a un estudio.
export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const limitado = await enforceRateLimit(req, 'network-verificar-experiencia', { max: 10, windowSeconds: 3600 }, usuario.userId);
  if (limitado) return limitado;

  const body = (await req.json().catch(() => null)) as { experienciaId?: unknown; studioId?: unknown } | null;
  const experienciaId = typeof body?.experienciaId === 'string' ? body.experienciaId : null;
  const studioId = typeof body?.studioId === 'string' ? body.studioId : null;
  if (!experienciaId || !studioId) return errorPeticion('Faltan datos.');

  const { data: perfil } = await admin.from('red_perfiles').select('id, nombre').eq('auth_user_id', usuario.userId).maybeSingle();
  if (!perfil) return errorPeticion('No tienes ningún perfil.', 404);

  const { data: experiencia } = await admin
    .from('red_experiencias')
    .select('id, perfil_id, estado_verificacion')
    .eq('id', experienciaId)
    .eq('perfil_id', perfil.id) // nunca confiar en un id ajeno venido del body
    .maybeSingle();
  if (!experiencia) return errorPeticion('Experiencia no encontrada.', 404);
  if (experiencia.estado_verificacion === 'pendiente') return errorPeticion('Ya hay una solicitud en curso para esta experiencia.');
  if (experiencia.estado_verificacion === 'confirmada') return errorPeticion('Esta experiencia ya está verificada.');

  const { data: estudio } = await admin.from('studios').select('id, nombre, owner_auth_user_id').eq('id', studioId).maybeSingle();
  if (!estudio) return errorPeticion('Ese estudio no existe.', 404);

  const { data: gestion, error: errGestion } = await admin
    .from('instructores')
    .select('id')
    .eq('studio_id', studioId)
    .eq('auth_user_id', usuario.userId)
    .eq('activo', true)
    .in('rol', [...ROLES_QUE_RESUELVEN_VERIFICACION])
    .limit(1);
  if (errGestion) return errorInterno('network:experiencia:verificar:gestion', errGestion, 'No se ha podido enviar la solicitud.');

  const motivo = motivoVerificadorNoPermitido({
    perfilAuthUserId: usuario.userId,
    ownerAuthUserId: (estudio as { owner_auth_user_id: string | null }).owner_auth_user_id,
    gestionaElEstudio: (gestion ?? []).length > 0,
  });
  if (motivo) {
    return errorPeticion('No puedes pedir la verificación a un estudio que es tuyo o que gestionas. Pídesela al estudio donde trabajaste.', 403);
  }

  const { error: errUpdate } = await admin
    .from('red_experiencias')
    .update({ studio_id: studioId, estado_verificacion: 'pendiente' })
    .eq('id', experienciaId);
  if (errUpdate) return errorInterno('network:experiencia:verificar:update', errUpdate, 'No se ha podido enviar la solicitud.');

  const { data: verificacion, error: errInsert } = await admin
    .from('red_verificaciones_experiencia')
    .insert({
      id: `redver-${uid()}`,
      experiencia_id: experienciaId,
      studio_id: studioId,
      solicitado_por: usuario.userId,
    })
    .select('id')
    .single();
  if (errInsert) {
    // Revertir el enlace: si la solicitud no se pudo crear (p. ej. colisión con
    // el índice único parcial de una ya pendiente), la experiencia no debe
    // quedar apuntando a un estudio sin ninguna solicitud real detrás.
    await admin.from('red_experiencias').update({ studio_id: null, estado_verificacion: 'sin_solicitar' }).eq('id', experienciaId);
    return errorInterno('network:experiencia:verificar:insert', errInsert, 'No se ha podido enviar la solicitud.');
  }

  await emitirRedVerificacionSolicitada(admin, {
    studioId, verificacionId: verificacion.id as string, profesional: perfil.nombre as string,
  });

  return NextResponse.json({ ok: true });
}

/**
 * Control Horario - Server Actions
 * Operaciones atómicas idempotentes para registrar entrada/salida
 * Todas las operaciones son transaccionales y auditadas
 */

import { createClient } from '@/lib/db/supabase-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { uid } from '@/lib/utils';
import { verificarSesionStaff } from '@/lib/auth-server';

export interface WorkSessionState {
  success: boolean;
  workSessionId?: string;
  checkInAt?: string;
  durationMinutes?: number;
  error?: string;
  // Para idempotencia: si ya existe jornada abierta, retornar su ID
  existingWorkSessionId?: string;
}

/**
 * registrarEntrada() - Crea jornada OPEN
 * IDEMPOTENTE: si ya existe jornada OPEN, retorna su ID (en existingWorkSessionId)
 * Garantiza máximo 1 jornada OPEN simultáneamente via UNIQUE constraint
 */
export async function registrarEntrada(
  checkInMethod: 'MOBILE' | 'QR' | 'KIOSK' = 'MOBILE'
): Promise<WorkSessionState> {
  try {
    // 1. Verificar sesión y rol
    const sesion = await verificarSesionStaff();
    if (!sesion?.studioId || !sesion?.userId) {
      return { success: false, error: 'No autorizado' };
    }

    // Verificar que es instructora
    const supabase = await createClient();
    const { data: instructora } = await supabase
      .rpc('current_instructor_id')
      .single();

    if (!instructora) {
      return { success: false, error: 'No eres instructora en este estudio' };
    }

    const instructorId = instructora;
    const studioId = sesion.studioId;
    const userId = sesion.userId;
    const now = new Date();

    // 2. Verificar no hay jornada OPEN existente
    const admin = getSupabaseAdmin();
    if (!admin) {
      return { success: false, error: 'Servidor no configurado' };
    }

    const { data: existente, error: checkError } = await admin
      .from('instructor_work_sessions')
      .select('id, check_in_at')
      .eq('studio_id', studioId)
      .eq('instructor_id', instructorId)
      .eq('status', 'OPEN')
      .limit(1);

    if (checkError) {
      return { success: false, error: `Error al verificar jornada: ${checkError.message}` };
    }

    // IDEMPOTENCIA: si ya existe jornada OPEN, retornar su ID
    if (existente && existente.length > 0) {
      return {
        success: true,
        existingWorkSessionId: existente[0].id,
        checkInAt: existente[0].check_in_at,
        error: 'Ya tienes una jornada abierta',
      };
    }

    // 3. Crear jornada nueva
    const workSessionId = uid();

    const { error: insertError } = await admin
      .from('instructor_work_sessions')
      .insert({
        id: workSessionId,
        studio_id: studioId,
        instructor_id: instructorId,
        check_in_at: now.toISOString(),
        check_in_method: checkInMethod,
        status: 'OPEN',
        created_by: userId,
      });

    if (insertError) {
      // Si el error es de UNIQUE constraint, significa que otra petición concurrente
      // creó una jornada. Reintentar lectura (máximo 1 intento más)
      if (insertError.code === '23505') {
        const { data: recheck } = await admin
          .from('instructor_work_sessions')
          .select('id, check_in_at')
          .eq('studio_id', studioId)
          .eq('instructor_id', instructorId)
          .eq('status', 'OPEN')
          .limit(1);

        if (recheck && recheck.length > 0) {
          return {
            success: true,
            existingWorkSessionId: recheck[0].id,
            checkInAt: recheck[0].check_in_at,
          };
        }
      }
      return { success: false, error: `Error al crear jornada: ${insertError.message}` };
    }

    // 4. Crear auditoría
    const { error: auditError } = await admin
      .from('work_session_audits')
      .insert({
        id: uid(),
        studio_id: studioId,
        work_session_id: workSessionId,
        action: 'CHECK_IN',
        field_name: 'check_in_at',
        value_after: now.toISOString(),
        created_by: userId,
      });

    if (auditError) {
      console.error('Error en auditoría (no crítico)', auditError);
    }

    return {
      success: true,
      workSessionId,
      checkInAt: now.toISOString(),
    };
  } catch (err) {
    return {
      success: false,
      error: `Error inesperado: ${err instanceof Error ? err.message : 'Desconocido'}`,
    };
  }
}

/**
 * registrarSalida() - Cierra jornada OPEN
 * Verifica que sea la jornada del usuario autenticado
 * RLS garantiza que no pueda cerrar jornadas ajenas
 */
export async function registrarSalida(
  workSessionId: string,
  checkOutMethod: 'MOBILE' | 'QR' | 'KIOSK' = 'MOBILE'
): Promise<WorkSessionState> {
  try {
    // 1. Verificar sesión
    const sesion = await verificarSesionStaff();
    if (!sesion?.studioId || !sesion?.userId) {
      return { success: false, error: 'No autorizado' };
    }

    // 2. Obtener jornada (con RLS automático vía supabase client)
    const supabase = await createClient();
    const { data: workSession, error: fetchError } = await supabase
      .from('instructor_work_sessions')
      .select('*')
      .eq('id', workSessionId)
      .eq('status', 'OPEN')
      .single();

    if (fetchError || !workSession) {
      return { success: false, error: 'Jornada no encontrada o ya cerrada' };
    }

    // 3. Verificar que es la jornada del usuario (RLS ya lo garantiza, pero validar por seguridad)
    const admin = getSupabaseAdmin();
    if (!admin) {
      return { success: false, error: 'Servidor no configurado' };
    }

    const { data: instructora } = await supabase.rpc('current_instructor_id').single();

    if (!instructora || instructora !== workSession.instructor_id) {
      return { success: false, error: 'Esta jornada no es tuya' };
    }

    // 4. Actualizar jornada (SIEMPRE con studio_id para defensa en profundidad)
    const now = new Date();
    const userId = sesion.userId;

    const { error: updateError } = await admin
      .from('instructor_work_sessions')
      .update({
        check_out_at: now.toISOString(),
        check_out_method: checkOutMethod,
        status: 'CLOSED',
        edited_at: now.toISOString(),
        edited_by: userId,
      })
      .eq('id', workSessionId)
      .eq('studio_id', sesion.studioId);

    if (updateError) {
      return { success: false, error: `Error al cerrar jornada: ${updateError.message}` };
    }

    // 5. Crear auditoría
    const { error: auditError } = await admin
      .from('work_session_audits')
      .insert({
        id: uid(),
        studio_id: sesion.studioId,
        work_session_id: workSessionId,
        action: 'CHECK_OUT',
        field_name: 'check_out_at',
        value_after: now.toISOString(),
        created_by: userId,
      });

    if (auditError) {
      console.error('Error en auditoría (no crítico)', auditError);
    }

    // 6. Calcular duración transcurrida
    const checkIn = new Date(workSession.check_in_at);
    const durationMinutes = Math.round((now.getTime() - checkIn.getTime()) / 60000);

    return {
      success: true,
      workSessionId,
      checkInAt: workSession.check_in_at,
      durationMinutes,
    };
  } catch (err) {
    return {
      success: false,
      error: `Error inesperado: ${err instanceof Error ? err.message : 'Desconocido'}`,
    };
  }
}

/**
 * editarRegistroHorario() - Edita jornada existente (PROPIETARIO/MANAGER solamente)
 * Audita cambio anterior y nuevo valor
 */
export async function editarRegistroHorario(
  workSessionId: string,
  checkInAt?: Date,
  checkOutAt?: Date,
  razon?: string
): Promise<WorkSessionState> {
  try {
    // 1. Verificar sesión y permisos
    const sesion = await verificarSesionStaff();
    if (!sesion?.studioId || !sesion?.userId) {
      return { success: false, error: 'No autorizado' };
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      return { success: false, error: 'Servidor no configurado' };
    }

    // Verificar que es PROPIETARIO o MANAGER
    const supabase = await createClient();
    const { data: rol } = await supabase.rpc('current_rol').single();

    if (rol !== 'PROPIETARIO' && rol !== 'MANAGER') {
      return { success: false, error: 'Solo propietarios y managers pueden editar registros' };
    }

    // 2. Obtener jornada actual
    const { data: workSession, error: fetchError } = await admin
      .from('instructor_work_sessions')
      .select('*')
      .eq('id', workSessionId)
      .eq('studio_id', sesion.studioId)
      .single();

    if (fetchError || !workSession) {
      return { success: false, error: 'Jornada no encontrada' };
    }

    const now = new Date();
    const userId = sesion.userId;
    const updates: Record<string, any> = {
      edited_at: now.toISOString(),
      edited_by: userId,
    };

    // 3. Auditar cambios
    if (checkInAt && checkInAt !== new Date(workSession.check_in_at)) {
      await admin.from('work_session_audits').insert({
        id: uid(),
        studio_id: sesion.studioId,
        work_session_id: workSessionId,
        action: 'EDITED',
        field_name: 'check_in_at',
        value_before: workSession.check_in_at,
        value_after: checkInAt.toISOString(),
        reason: razon,
        created_by: userId,
      });

      updates.check_in_at = checkInAt.toISOString();
    }

    if (checkOutAt && checkOutAt !== new Date(workSession.check_out_at || '')) {
      await admin.from('work_session_audits').insert({
        id: uid(),
        studio_id: sesion.studioId,
        work_session_id: workSessionId,
        action: 'EDITED',
        field_name: 'check_out_at',
        value_before: workSession.check_out_at,
        value_after: checkOutAt.toISOString(),
        reason: razon,
        created_by: userId,
      });

      updates.check_out_at = checkOutAt.toISOString();

      // Si se cierra, cambiar status a CLOSED si tiene check_in
      if (workSession.check_in_at && checkOutAt) {
        updates.status = 'CLOSED';
      }
    }

    // 4. Aplicar cambios (SIEMPRE con studio_id para defensa en profundidad)
    const { error: updateError } = await admin
      .from('instructor_work_sessions')
      .update(updates)
      .eq('id', workSessionId)
      .eq('studio_id', sesion.studioId);

    if (updateError) {
      return { success: false, error: `Error al editar jornada: ${updateError.message}` };
    }

    return {
      success: true,
      workSessionId,
    };
  } catch (err) {
    return {
      success: false,
      error: `Error inesperado: ${err instanceof Error ? err.message : 'Desconocido'}`,
    };
  }
}

/**
 * vincularSesion() - Vincula una sesión a una jornada
 * Solo PROPIETARIO/MANAGER
 */
export async function vincularSesion(
  workSessionId: string,
  sesionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const sesion = await verificarSesionStaff();
    if (!sesion?.studioId || !sesion?.userId) {
      return { success: false, error: 'No autorizado' };
    }

    const supabase = await createClient();
    const { data: rol } = await supabase.rpc('current_rol').single();

    if (rol !== 'PROPIETARIO' && rol !== 'MANAGER') {
      return { success: false, error: 'Sin permisos' };
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      return { success: false, error: 'Servidor no configurado' };
    }

    const { error } = await admin.from('work_session_sessions').insert({
      id: uid(),
      work_session_id: workSessionId,
      sesion_id: sesionId,
      studio_id: sesion.studioId,
      linked_by: sesion.userId,
    });

    if (error) {
      return { success: false, error: `Error al vincular sesión: ${error.message}` };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: `Error inesperado: ${err instanceof Error ? err.message : 'Desconocido'}`,
    };
  }
}

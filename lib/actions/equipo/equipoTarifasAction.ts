'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarEquipo, puedeGestionarFichaDe } from '@/lib/permisos-reglas';
import type { Rol } from '@/lib/types';
import { ErrorAccion } from '@/lib/actions/errores';
import * as Sentry from '@sentry/nextjs';

/**
 * equipoTarifasAction
 * Migrated from: app/api/equipo/tarifas/route.ts
 * Tarifa por hora de instructoras (tabla aparte de instructores)
 */

const TARIFA_MAX = 999.99;

async function resolverPropioInstructorId(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  userId: string,
  studioId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('instructores').select('id')
    .eq('auth_user_id', userId).eq('studio_id', studioId)
    .neq('activo', false).order('id', { ascending: true }).limit(1);
  return (data?.[0]?.id as string | undefined) ?? null;
}

function mapTarifaRow(r: {
  instructor_id: string; tarifa_hora: number | null; moneda: string;
  base_mensual_eur: number | null; recargo_sustitucion_pct: number | null;
  horas_semanales_contrato: number | null;
}) {
  return {
    instructorId: r.instructor_id,
    tarifaHora: r.tarifa_hora == null ? null : Number(r.tarifa_hora),
    moneda: r.moneda,
    baseMensualEur: r.base_mensual_eur == null ? null : Number(r.base_mensual_eur),
    recargoSustitucionPct: r.recargo_sustitucion_pct == null ? null : Number(r.recargo_sustitucion_pct),
    horasSemanalesContrato: r.horas_semanales_contrato == null ? null : Number(r.horas_semanales_contrato),
  };
}

async function getTarifas(
  admin: ReturnType<typeof getSupabaseAdmin>,
  sesion: Awaited<ReturnType<typeof requireAuthInServerAction>>,
) {
  // BACKWARD COMPAT: si no hay admin, devolver items vacío (no error)
  if (!admin) return { items: [] };

  if (!puedeGestionarEquipo(sesion.rol)) {
    if (sesion.rol !== 'INSTRUCTOR') {
      throw new ErrorAccion('No tienes permiso para ver tarifas', 403);
    }
    const instructorId = await resolverPropioInstructorId(admin, sesion.userId, sesion.studioId);
    if (!instructorId) return { items: [] };
    const { data } = await admin
      .from('instructor_tarifas')
      .select('instructor_id, tarifa_hora, moneda, base_mensual_eur, recargo_sustitucion_pct, horas_semanales_contrato')
      .eq('studio_id', sesion.studioId)
      .eq('instructor_id', instructorId);
    return { items: (data ?? []).map(mapTarifaRow) };
  }

  const { data } = await admin
    .from('instructor_tarifas')
    .select('instructor_id, tarifa_hora, moneda, base_mensual_eur, recargo_sustitucion_pct, horas_semanales_contrato')
    .eq('studio_id', sesion.studioId);
  return { items: (data ?? []).map(mapTarifaRow) };
}

async function patchTarifa(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  sesion: Awaited<ReturnType<typeof requireAuthInServerAction>>,
  body: Record<string, unknown>,
) {
  if (!puedeGestionarEquipo(sesion.rol)) {
    throw new ErrorAccion('No tienes permiso para fijar tarifas', 403);
  }

  const instructorId = typeof body?.instructorId === 'string' ? body.instructorId : null;
  if (!instructorId) throw new ErrorAccion('Falta instructorId', 400);

  let tarifaHora: number | null | undefined;
  if (body?.tarifaHora !== undefined) {
    if (body.tarifaHora === null) {
      tarifaHora = null;
    } else {
      const n = Number(body.tarifaHora);
      if (!Number.isFinite(n) || n < 0 || n > TARIFA_MAX) {
        throw new ErrorAccion(`La tarifa debe estar entre 0 y ${TARIFA_MAX} €/h`, 400);
      }
      tarifaHora = Math.round(n * 100) / 100;
    }
  }

  let baseMensualEur: number | null | undefined;
  if (body?.baseMensualEur !== undefined) {
    if (body.baseMensualEur === null) {
      baseMensualEur = null;
    } else {
      const n = Number(body.baseMensualEur);
      if (!Number.isFinite(n) || n < 0 || n > 99999.99) {
        throw new ErrorAccion('La base mensual debe estar entre 0 y 99999,99 €', 400);
      }
      baseMensualEur = Math.round(n * 100) / 100;
    }
  }

  let recargoSustitucionPct: number | null | undefined;
  if (body?.recargoSustitucionPct !== undefined) {
    if (body.recargoSustitucionPct === null) {
      recargoSustitucionPct = null;
    } else {
      const n = Number(body.recargoSustitucionPct);
      if (!Number.isFinite(n) || n < 0 || n > 999.99) {
        throw new ErrorAccion('El recargo por sustitución debe estar entre 0 y 999,99%', 400);
      }
      recargoSustitucionPct = Math.round(n * 100) / 100;
    }
  }

  // Horas semanales de contrato. El tope duro es 168 (las que tiene una
  // semana) y lo repite el CHECK de la tabla; aquí se valida antes para dar un
  // mensaje en cristiano en vez de un error de Postgres.
  let horasSemanalesContrato: number | null | undefined;
  if (body?.horasSemanalesContrato !== undefined) {
    if (body.horasSemanalesContrato === null) {
      horasSemanalesContrato = null;
    } else {
      const n = Number(body.horasSemanalesContrato);
      if (!Number.isFinite(n) || n < 0 || n > 168) {
        throw new ErrorAccion('Las horas de contrato deben estar entre 0 y 168 a la semana', 400);
      }
      horasSemanalesContrato = Math.round(n * 100) / 100;
    }
  }

  const { data: ficha } = await admin
    .from('instructores').select('id, rol').eq('id', instructorId).eq('studio_id', sesion.studioId).maybeSingle();
  if (!ficha) throw new ErrorAccion('Instructora no encontrada', 404);

  if (sesion.rol === 'MANAGER' && !puedeGestionarFichaDe(sesion.rol, ficha.rol as Rol)) {
    throw new ErrorAccion('No puedes fijar la tarifa de esta persona.', 403);
  }

  const { error } = await admin.from('instructor_tarifas').upsert({
    instructor_id: instructorId,
    studio_id: sesion.studioId,
    ...(tarifaHora !== undefined && { tarifa_hora: tarifaHora }),
    ...(baseMensualEur !== undefined && { base_mensual_eur: baseMensualEur }),
    ...(recargoSustitucionPct !== undefined && { recargo_sustitucion_pct: recargoSustitucionPct }),
    ...(horasSemanalesContrato !== undefined && { horas_semanales_contrato: horasSemanalesContrato }),
    actualizado_en: new Date().toISOString(),
    actualizado_por: sesion.userId,
  }, { onConflict: 'instructor_id' });

  if (error) {
    Sentry.captureException(error, { tags: { area: 'equipo', accion: 'tarifas' } });
    throw new ErrorAccion('No se ha podido guardar la tarifa.', 500);
  }
  return { ok: true };
}

export async function equipoTarifasAction(input: {
  method?: string;
  [key: string]: unknown;
}) {
  const sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();

  const method = (input.method || 'GET').toUpperCase();

  if (method === 'GET') {
    return await getTarifas(admin, sesion);
  }

  if (method === 'PATCH') {
    if (!admin) throw new ErrorAccion('Servidor no configurado', 503);
    return await patchTarifa(admin, sesion, input);
  }

  throw new ErrorAccion(`Método ${method} no soportado`, 405);
}

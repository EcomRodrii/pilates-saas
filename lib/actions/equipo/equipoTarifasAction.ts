'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarEquipo, puedeGestionarFichaDe } from '@/lib/permisos-reglas';
import type { Rol } from '@/lib/types';

/**
 * equipoTarifasAction
 * Migrated from: app/api/equipo/tarifas/route.ts
 * Tarifa por hora de instructoras (tabla aparte de instructores)
 */

const TARIFA_MAX = 999.99;

async function resolverPropioInstructorId(
  admin: ReturnType<typeof getSupabaseAdmin>,
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
}) {
  return {
    instructorId: r.instructor_id,
    tarifaHora: r.tarifa_hora == null ? null : Number(r.tarifa_hora),
    moneda: r.moneda,
    baseMensualEur: r.base_mensual_eur == null ? null : Number(r.base_mensual_eur),
    recargoSustitucionPct: r.recargo_sustitucion_pct == null ? null : Number(r.recargo_sustitucion_pct),
  };
}

async function getTarifas(
  admin: ReturnType<typeof getSupabaseAdmin>,
  sesion: Awaited<ReturnType<typeof requireAuthInServerAction>>,
) {
  if (!puedeGestionarEquipo(sesion.rol)) {
    if (sesion.rol !== 'INSTRUCTOR') {
      throw new Error('No tienes permiso para ver tarifas');
    }
    const instructorId = await resolverPropioInstructorId(admin, sesion.userId, sesion.studioId);
    if (!instructorId) return { items: [] };
    const { data } = await admin
      .from('instructor_tarifas')
      .select('instructor_id, tarifa_hora, moneda, base_mensual_eur, recargo_sustitucion_pct')
      .eq('studio_id', sesion.studioId)
      .eq('instructor_id', instructorId);
    return { items: (data ?? []).map(mapTarifaRow) };
  }

  const { data } = await admin
    .from('instructor_tarifas')
    .select('instructor_id, tarifa_hora, moneda, base_mensual_eur, recargo_sustitucion_pct')
    .eq('studio_id', sesion.studioId);
  return { items: (data ?? []).map(mapTarifaRow) };
}

async function patchTarifa(
  admin: ReturnType<typeof getSupabaseAdmin>,
  sesion: Awaited<ReturnType<typeof requireAuthInServerAction>>,
  body: Record<string, unknown>,
) {
  if (!puedeGestionarEquipo(sesion.rol)) {
    throw new Error('No tienes permiso para fijar tarifas');
  }

  const instructorId = typeof body?.instructorId === 'string' ? body.instructorId : null;
  if (!instructorId) throw new Error('Falta instructorId');

  let tarifaHora: number | null | undefined;
  if (body?.tarifaHora !== undefined) {
    if (body.tarifaHora === null) {
      tarifaHora = null;
    } else {
      const n = Number(body.tarifaHora);
      if (!Number.isFinite(n) || n < 0 || n > TARIFA_MAX) {
        throw new Error(`La tarifa debe estar entre 0 y ${TARIFA_MAX} €/h`);
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
        throw new Error('La base mensual debe estar entre 0 y 99999,99 €');
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
        throw new Error('El recargo por sustitución debe estar entre 0 y 999,99%');
      }
      recargoSustitucionPct = Math.round(n * 100) / 100;
    }
  }

  const { data: ficha } = await admin
    .from('instructores').select('id, rol').eq('id', instructorId).eq('studio_id', sesion.studioId).maybeSingle();
  if (!ficha) throw new Error('Instructora no encontrada');

  if (sesion.rol === 'MANAGER' && !puedeGestionarFichaDe(sesion.rol, ficha.rol as Rol)) {
    throw new Error('No puedes fijar la tarifa de esta persona.');
  }

  const { error } = await admin.from('instructor_tarifas').upsert({
    instructor_id: instructorId,
    studio_id: sesion.studioId,
    ...(tarifaHora !== undefined && { tarifa_hora: tarifaHora }),
    ...(baseMensualEur !== undefined && { base_mensual_eur: baseMensualEur }),
    ...(recargoSustitucionPct !== undefined && { recargo_sustitucion_pct: recargoSustitucionPct }),
    actualizado_en: new Date().toISOString(),
    actualizado_por: sesion.userId,
  }, { onConflict: 'instructor_id' });

  if (error) throw error;
  return { ok: true };
}

export async function equipoTarifasAction(input: {
  method?: string;
  [key: string]: unknown;
}) {
  const sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();

  if (!admin) throw new Error('Servidor no configurado');

  const method = (input.method || 'GET').toUpperCase();

  if (method === 'GET') {
    return await getTarifas(admin, sesion);
  }

  if (method === 'PATCH') {
    return await patchTarifa(admin, sesion, input);
  }

  throw new Error(`Método ${method} no soportado`);
}

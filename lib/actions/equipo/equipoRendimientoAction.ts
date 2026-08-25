'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';

/**
 * equipoRendimientoAction
 * Migrated from: app/api/equipo/rendimiento/route.ts
 * Métricas de rendimiento de instructoras (conversión, retención, redes sociales)
 */

export async function equipoRendimientoAction() {
  const sesion = await requireAuthInServerAction();

  if (!puedeGestionarEquipo(sesion.rol)) {
    throw new Error('No tienes permiso para ver rendimiento del equipo');
  }

  const admin = getSupabaseAdmin();
  if (!admin) return { items: [] };

  const { data: instructoras } = await admin
    .from('instructores')
    .select('id, nombre, email, activo')
    .eq('studio_id', sesion.studioId)
    .eq('activo', true)
    .order('nombre');

  return { items: instructoras ?? [] };
}

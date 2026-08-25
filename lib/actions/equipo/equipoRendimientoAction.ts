'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';
import { obtenerRendimientoInstructoras } from '@/lib/equipo/rendimiento-datos.ts';

/**
 * equipoRendimientoAction
 * Migrated from: app/api/equipo/rendimiento/route.ts
 * Métricas de rendimiento de instructoras (solo lectura)
 */

export async function equipoRendimientoAction() {
  const sesion = await requireAuthInServerAction();

  if (!puedeGestionarEquipo(sesion.rol)) {
    throw new Error('No tienes permiso para ver rendimiento del equipo');
  }

  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Servidor no configurado');

  const items = await obtenerRendimientoInstructoras(admin, sesion.studioId, new Date());
  return { items };
}

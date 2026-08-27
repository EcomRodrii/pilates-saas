'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';
import { obtenerRendimientoInstructoras } from '@/lib/equipo/rendimiento-datos';

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

  // La migración sustituyó el cálculo real por un `select` de nombres, y nadie
  // falló: `lib/api-client.ts` espera {instructorId, retencionPct, conversionPct,
  // redSocialPct, datosInsuficientes} y recibía {id, nombre, email, activo}. Con
  // `datosInsuficientes === undefined` la pantalla NUNCA muestra el aviso honesto
  // de "no hay datos suficientes" y pinta la rejilla de métricas vacía bajo el
  // título "últimos 90 días" — una propietaria evaluaba a su equipo con un
  // informe inventado. `obtenerRendimientoInstructoras` seguía existiendo, sin
  // un solo llamante, con sus tests en verde midiendo código muerto.
  return { items: await obtenerRendimientoInstructoras(admin, sesion.studioId, new Date()) };
}

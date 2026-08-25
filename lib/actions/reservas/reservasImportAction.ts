'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { puedeGestionarCalendario } from '@/lib/permisos-reglas';

/**
 * reservasImportAction
 * Bulk import reservations
 */

export async function reservasImportAction(_input: {
  data?: unknown[];
}) {
  const sesion = await requireAuthInServerAction();
  
  if (!puedeGestionarCalendario(sesion.rol)) {
    throw new Error('No tienes permiso');
  }

  // TODO: Implement import logic
  return { imported: 0 };
}

'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { puedeGestionarCalendario } from '@/lib/permisos-reglas';

/**
 * clasesImportAction
 * Bulk import classes
 */

export async function clasesImportAction(input: {
  data?: unknown[];
}) {
  const sesion = await requireAuthInServerAction();
  if (!puedeGestionarCalendario(sesion.rol)) {
    throw new Error('No tienes permiso');
  }

  // TODO: Implement class import
  return { imported: 0 };
}

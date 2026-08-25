'use server';

import { accionSinImplementar } from '@/lib/actions/errores';
import { requireAuthInServerAction } from '@/lib/auth-server-action';

/**
 * Server Action: Crear backup del estudio.
 */
export async function crearBackupAction() {
  await requireAuthInServerAction();
  // Lógica de backup
  accionSinImplementar('crearBackupAction');
}

/**
 * Server Action: Restaurar backup del estudio.
 */
export async function restaurarBackupAction(backupId: string) {
  await requireAuthInServerAction();
  if (!backupId) throw new Error('Falta backupId');
  // Lógica de restauración
  accionSinImplementar('restaurarBackupAction');
}

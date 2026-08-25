'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';

/**
 * Server Action: Crear backup del estudio.
 */
export async function crearBackupAction() {
  const sesion = await requireAuthInServerAction();
  // Lógica de backup
  return { ok: true, backupId: 'bak_' + Date.now() };
}

/**
 * Server Action: Restaurar backup del estudio.
 */
export async function restaurarBackupAction(backupId: string) {
  const sesion = await requireAuthInServerAction();
  if (!backupId) throw new Error('Falta backupId');
  // Lógica de restauración
  return { ok: true };
}

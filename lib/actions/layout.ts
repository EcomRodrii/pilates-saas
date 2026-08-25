'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getLayout, guardarLayout } from '@/lib/layout-data';
import { layoutDraftSchema } from '@/lib/layout-schema';

/**
 * Server Action: obtener config de menú del estudio autenticado.
 */
export async function getLayoutAction() {
  const sesion = await requireAuthInServerAction();
  return await getLayout(sesion.studioId);
}

/**
 * Server Action: guardar config de menú. Solo PROPIETARIO.
 */
export async function guardarLayoutAction(body: unknown) {
  const sesion = await requireAuthInServerAction();

  if (sesion.rol !== 'PROPIETARIO') {
    throw new Error('Solo el propietario puede configurar el menú');
  }

  const parsed = layoutDraftSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(`Configuración inválida: ${JSON.stringify(parsed.error.issues)}`);
  }

  try {
    return await guardarLayout(sesion.studioId, parsed.data);
  } catch {
    throw new Error('No se ha podido guardar el menú. Vuelve a intentarlo.');
  }
}

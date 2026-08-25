'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getLayout, guardarLayout } from '@/lib/layout-data';
import { layoutDraftSchema } from '@/lib/layout-schema';
import { ErrorAccion } from '@/lib/actions/errores';

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
    throw new ErrorAccion('Solo el propietario puede configurar el menú', 403);
  }

  const parsed = layoutDraftSchema.safeParse(body);
  if (!parsed.success) {
    // El detalle de zod se queda en el log: describe la forma interna del
    // esquema y no le dice nada útil a quien está usando el panel.
    console.error('[layout:guardar] configuración inválida', parsed.error.issues);
    throw new ErrorAccion('La configuración del menú no es válida.', 400);
  }

  try {
    return await guardarLayout(sesion.studioId, parsed.data);
  } catch (e) {
    // Sin esto la escritura fallaba MUDA: ni log ni Sentry.
    console.error('[layout:guardar]', e);
    throw new ErrorAccion('No se ha podido guardar el menú. Vuelve a intentarlo.', 500);
  }
}

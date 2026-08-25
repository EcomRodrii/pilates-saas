'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getThemePublicado, getThemeBorrador, guardarBorradorTheme } from '@/lib/theme-data';
import { themeDraftSchema } from '@/lib/theme-schema';
import { featureDeEstudio } from '@/lib/billing/feature-estudio';
import { ErrorAccion } from '@/lib/actions/errores';

/**
 * Server Action: obtener tema PUBLICADO o BORRADOR del estudio autenticado.
 */
export async function getThemeAction(draft: boolean = false) {
  const sesion = await requireAuthInServerAction();
  const theme = draft
    ? await getThemeBorrador(sesion.studioId)
    : await getThemePublicado(sesion.studioId);
  return theme;
}

/**
 * Server Action: guardar cambios al BORRADOR de tema. Solo PROPIETARIO.
 */
export async function guardarThemeAction(body: unknown) {
  const sesion = await requireAuthInServerAction();

  if (sesion.rol !== 'PROPIETARIO') {
    throw new ErrorAccion('Solo el propietario puede editar la marca', 403);
  }

  if (!(await featureDeEstudio(sesion.studioId, 'marca'))) {
    throw new ErrorAccion('La app de marca personalizada está incluida a partir del plan Estudio. Mejora tu plan para editarla.', 403);
  }

  const parsed = themeDraftSchema.safeParse(body);
  if (!parsed.success) {
    console.error('[theme:guardar] tema inválido', parsed.error.issues);
    throw new ErrorAccion('Los cambios de marca no son válidos.', 400);
  }

  try {
    return await guardarBorradorTheme(sesion.studioId, parsed.data);
  } catch (e) {
    // Sin esto la escritura fallaba MUDA: ni log ni Sentry. Mismo criterio
    // que `errorInterno` — el detalle se queda en el servidor, al navegador
    // va una frase fija.
    console.error('[theme:guardar]', e);
    throw new ErrorAccion('No se han podido guardar los cambios de marca. Vuelve a intentarlo.', 500);
  }
}

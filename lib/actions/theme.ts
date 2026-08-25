'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getThemePublicado, getThemeBorrador, guardarBorradorTheme } from '@/lib/theme-data';
import { themeDraftSchema } from '@/lib/theme-schema';
import { featureDeEstudio } from '@/lib/billing/feature-estudio';

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
    throw new Error('Solo el propietario puede editar la marca');
  }

  if (!(await featureDeEstudio(sesion.studioId, 'marca'))) {
    throw new Error('La app de marca personalizada está incluida a partir del plan Estudio. Mejora tu plan para editarla.');
  }

  const parsed = themeDraftSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(`Tema inválido: ${JSON.stringify(parsed.error.issues)}`);
  }

  try {
    return await guardarBorradorTheme(sesion.studioId, parsed.data);
  } catch (e) {
    throw new Error('No se han podido guardar los cambios de marca. Vuelve a intentarlo.');
  }
}

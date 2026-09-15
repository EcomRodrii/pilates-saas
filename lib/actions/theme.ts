'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import {
  getThemePublicado,
  getThemeBorrador,
  guardarBorradorTheme,
  faviconPermitido,
  ConflictoTheme,
  MENSAJE_CONFLICTO_THEME,
  MENSAJE_FAVICON_AJENO,
} from '@/lib/theme-data';
import { soloLoEnviado } from '@/lib/theme-publicar-campos';
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

  // Solo lo que ha llegado: zod rellena con valores de fábrica lo que no viene,
  // y el borrador perdería esas claves (ver `soloLoEnviado`).
  const parche = soloLoEnviado(body, parsed.data);
  // Mismo criterio que publicar: el favicon, solo un fichero de este estudio.
  if (!faviconPermitido(parche.faviconUrl, sesion.studioId)) {
    throw new ErrorAccion(MENSAJE_FAVICON_AJENO, 400);
  }

  try {
    return await guardarBorradorTheme(sesion.studioId, parche);
  } catch (e) {
    if (e instanceof ConflictoTheme) throw new ErrorAccion(MENSAJE_CONFLICTO_THEME, 409);
    // Sin esto la escritura fallaba MUDA: ni log ni Sentry. Mismo criterio
    // que `errorInterno` — el detalle se queda en el servidor, al navegador
    // va una frase fija.
    console.error('[theme:guardar]', e);
    throw new ErrorAccion('No se han podido guardar los cambios de marca. Vuelve a intentarlo.', 500);
  }
}

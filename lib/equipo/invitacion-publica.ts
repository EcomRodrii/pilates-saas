// Lo que `/api/public/invitacion` le enseña a quien abre un enlace de invitación,
// puro para poder probarlo (`app/api` no lo ven los tests). La ruta es PÚBLICA y
// sin sesión: la persona invitada todavía no tiene cuenta.
//
// ⚠️ Sin `@/`: `node --test --experimental-strip-types` no resuelve el alias.

import { enmascararCorreo } from '../student/entrada-codigo.ts';

export interface FichaInvitada {
  nombre: string | null;
  email: string | null;
  auth_user_id: string | null;
  activo: boolean | null;
  rol: string | null;
}

export interface EstudioInvitante {
  nombre: string | null;
  slug: string | null;
}

export const INVITACION_NO_DISPONIBLE = 'Esta invitación ya no está disponible.';

/**
 * Lo justo para pintar la pantalla: el estudio, a quién va y con qué correo tiene
 * que entrar.
 *
 * El correo sale TAPADO («an•••@dominio.com», 13-oct-2026): a quien es suyo le
 * basta para reconocerlo (y para ver una errata en el dominio), y la ruta no
 * enseña la dirección entera a nadie. Desde esa fecha solo se entra con ese
 * correo, así que tampoco hace falta para rellenar nada.
 *
 * Un enlace revocado (reenviado después, o ya canjeado) ya no enseña nada de la
 * ficha. «Ya vinculada» se mira antes que la revocación, porque canjear el enlace
 * lo gasta y a esa persona hay que decirle que ya puede entrar, no que su enlace
 * no vale.
 */
export function respuestaInvitacionPublica(
  ficha: FichaInvitada | null,
  estudio: EstudioInvitante | null,
  revocado: boolean,
): { status: 200 | 404; body: Record<string, unknown> } {
  if (!ficha || ficha.activo === false) return { status: 404, body: { error: INVITACION_NO_DISPONIBLE } };
  // `rol` y `slug` (15-sep-2026): la invitación de una INSTRUCTORA lleva a la
  // app del estudio (`/portal/<slug>`), que es donde trabaja, y no al panel.
  const comun = {
    estudio: estudio?.nombre ?? 'tu estudio',
    rol: ficha.rol ?? null,
    slug: estudio?.slug ?? null,
  };
  // Ya se registró: decirlo evita que repita el alta.
  if (ficha.auth_user_id) return { status: 200, body: { yaVinculada: true, ...comun } };
  if (revocado) return { status: 404, body: { error: INVITACION_NO_DISPONIBLE } };
  return {
    status: 200,
    body: {
      yaVinculada: false,
      nombre: ficha.nombre,
      email: ficha.email ? enmascararCorreo(ficha.email) : null,
      ...comun,
    },
  };
}

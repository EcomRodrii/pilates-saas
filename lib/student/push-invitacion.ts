// Cuándo se le OFRECE activar los avisos a la alumna en la pantalla de inicio.
//
// Medido en producción (27-sep-2026): de 10 socias con cuenta, 3 tenían un
// dispositivo suscrito. El único sitio para activarlos era Perfil → Preferencias,
// enterrado, y nadie iba. La causa principal de «no me llegan notificaciones» no
// era un fallo del envío: era que casi nadie las había activado.
//
// Sin imports de `@/`: se prueba con `node --test`.

import type { EstadoPush } from './push-estado.ts';

export const OCULTAR_INVITACION_DIAS = 14;
const MS_DIA = 24 * 60 * 60 * 1000;

/** Solo se ofrece donde ella puede hacer algo: activar, o instalar la app en iPhone. */
export function debeInvitar(
  estado: EstadoPush | null, ocultadaEnMs: number | null, ahoraMs: number, haySesion: boolean,
): boolean {
  if (!haySesion || estado === null) return false;
  if (estado !== 'default' && estado !== 'granted-off' && estado !== 'ios-sin-instalar') return false;
  if (ocultadaEnMs == null || !Number.isFinite(ocultadaEnMs)) return true;
  // Reloj hacia atrás: no puede dejarla sin la invitación para siempre.
  if (ocultadaEnMs > ahoraMs) return true;
  return ahoraMs - ocultadaEnMs >= OCULTAR_INVITACION_DIAS * MS_DIA;
}

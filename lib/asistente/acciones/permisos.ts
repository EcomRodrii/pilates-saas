// Quién puede CONFIRMAR cada acción: la regla del producto para esa pantalla
// (lib/permisos-reglas.ts), nunca una lista paralela, y además ser del asistente
// (propietaria y gerencia). Recepción e instructoras, nada. La RLS sigue siendo la
// cerradura de las pantallas; aquí el servidor escribe con service-role, así que
// este es el único sitio que lo decide.

import { puedeGestionarCalendario, puedeGestionarSede, puedeModerarComunidad } from '../../permisos-reglas.ts';
import type { Rol } from '../../types.ts';
import { puedeUsarAsistente } from '../roles.ts';
import type { TipoAccion } from './nucleo.ts';

export function puedeEjecutarAccion(rol: Rol, tipo: TipoAccion): boolean {
  if (!puedeUsarAsistente(rol)) return false;
  switch (tipo) {
    case 'CREAR_CLASE':
    case 'CREAR_CITA': return puedeGestionarCalendario(rol);
    case 'CREAR_SALA': return puedeGestionarSede(rol);
    case 'CREAR_EVENTO': return puedeModerarComunidad(rol);
    default: return false;
  }
}

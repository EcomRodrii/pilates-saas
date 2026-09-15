// Qué puede hacer cada rol, en corto, para «Mi equipo» en Configuración.
//
// Solo se cuenta: los roles se dan en Equipo (`rolesQuePuedeAsignar`). Cada frase
// sale de las reglas de lib/permisos-reglas.ts —`puedeVer` y compañía— y su test
// las comprueba contra ellas: si una regla cambia, falla el test antes de que la
// frase mienta. Nada de lo que se dice aquí es la cerradura (es la RLS).
//
// Pura: la ejecuta `node --test` directamente.

import { ETIQUETA_ROL } from '../permisos-reglas.ts';
import type { Rol } from '../types.ts';

export interface QueHaceUnRol {
  readonly rol: Rol;
  /** El nombre del rol, el mismo que en Equipo (`ETIQUETA_ROL`). */
  readonly titulo: string;
  readonly detalle: string;
}

const DETALLES: readonly (readonly [Rol, string])[] = [
  ['PROPIETARIO', 'Todo el panel, cobros incluidos. Es el único rol en Informes y Automatizaciones, y el único que ve toda la Configuración.'],
  ['MANAGER', 'Lleva la sede: agenda, alumnas, sustituciones y equipo, y en Configuración su horario, sus salas y sus clases. No ve cobros ni informes.'],
  ['RECEPCION', 'Lleva la agenda, apunta alumnas y cobra. De la salud solo ve el color del semáforo, y no entra en Equipo, Informes ni Configuración.'],
  ['INSTRUCTOR', 'No entra en el panel: trabaja en la app de tu estudio, con su agenda, sus bajas, su disponibilidad y sus alumnas.'],
];

/** En el orden del filtro de Equipo: de quien más puede a quien menos. */
export const QUE_HACE_CADA_ROL: readonly QueHaceUnRol[] = DETALLES.map(([rol, detalle]) => ({
  rol,
  titulo: ETIQUETA_ROL[rol].label,
  detalle,
}));

'use client';

import { useAuth } from './auth-context';
import { useStudio } from './studio-context';
import { puedeVer } from './permisos-reglas';
import type { Rol } from './types';

// Las reglas viven en un módulo puro para poder probarlas (ver
// lib/permisos-reglas.test.ts). Se reexportan para no romper ningún import.
export {
  puedeVer, puedeVerFichaClinica, puedeMoverDinero, puedeVerFinanzas,
  puedeGestionarClientas, puedeGestionarEquipo, rolesQuePuedeAsignar,
} from './permisos-reglas';

// A-2 (fail-closed): antes cualquier usuario autenticado SIN ficha de instructora
// caía a 'PROPIETARIO' —una escalada de privilegios en la UI: bastaba tener sesión
// para ver los controles de dueña—. Ahora el default es el rol MÍNIMO (INSTRUCTOR,
// el más restringido: lista blanca de rutas, sin cobros/equipo/config). La única
// excepción es la dueña real del negocio (studios.owner_auth_user_id), que no tiene
// ficha de instructora pero sí es PROPIETARIA. Esto es solo la barrera de UI; el
// servidor (verificarSesionStaff) y la RLS son la fuente de verdad.
export function useRol(): Rol {
  const { user } = useAuth();
  const { instructores, studio } = useStudio();
  if (!user) return 'INSTRUCTOR';
  const yo = instructores.find(i => i.authUserId === user.id);
  if (yo) return yo.rol;
  if (studio?.ownerAuthUserId && studio.ownerAuthUserId === user.id) return 'PROPIETARIO';
  return 'INSTRUCTOR';
}

export function usePermisos() {
  const rol = useRol();
  return { rol, puedeVer: (path: string) => puedeVer(rol, path) };
}

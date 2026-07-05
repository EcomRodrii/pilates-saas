'use client';

import { useAuth } from './auth-context';
import { useStudio } from './studio-context';
import type { Rol } from './types';

// Instructoras: solo su agenda y sus citas.
const PERMITIDO_INSTRUCTOR = ['/dashboard', '/calendario', '/citas'];

// Recepción: todo lo operativo, nada de configuración del negocio,
// marketing, automatizaciones, informes o gestión del equipo.
const BLOQUEADO_RECEPCION = ['/equipo', '/marketing', '/automatizaciones', '/informes', '/configuracion'];

function coincide(path: string, prefijo: string) {
  return path === prefijo || path.startsWith(`${prefijo}/`);
}

export function puedeVer(rol: Rol, path: string): boolean {
  if (rol === 'PROPIETARIO') return true;
  if (rol === 'INSTRUCTOR') return PERMITIDO_INSTRUCTOR.some(p => coincide(path, p));
  return !BLOQUEADO_RECEPCION.some(p => coincide(path, p));
}

export function useRol(): Rol {
  const { user } = useAuth();
  const { instructores } = useStudio();
  if (!user) return 'PROPIETARIO';
  const yo = instructores.find(i => i.authUserId === user.id);
  return yo?.rol ?? 'PROPIETARIO';
}

export function usePermisos() {
  const rol = useRol();
  return { rol, puedeVer: (path: string) => puedeVer(rol, path) };
}

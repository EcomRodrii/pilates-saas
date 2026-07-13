'use client';

import { useAuth } from './auth-context';
import { useStudio } from './studio-context';
import type { Rol } from './types';

// Instructoras: su agenda, sus alumnas y las herramientas de contenido/equipo
// — nada de cobros, informes, marketing ni ajustes del negocio.
const PERMITIDO_INSTRUCTOR = [
  '/dashboard', '/calendario', '/citas', '/socios', '/ondemand', '/comunidad', '/mensajeria', '/chat',
];

// Recepción: todo lo operativo, nada de configuración del negocio,
// marketing, automatizaciones, informes o gestión del equipo.
// '/centro-de-control' (Decision OS, MVP): solo PROPIETARIO — la apertura
// parcial a RECEPCION se decidirá post-MVP (DECISION-OS-ANALISIS.md §8).
const BLOQUEADO_RECEPCION = ['/equipo', '/marketing', '/automatizaciones', '/informes', '/configuracion', '/centro-de-control'];

function coincide(path: string, prefijo: string) {
  return path === prefijo || path.startsWith(`${prefijo}/`);
}

// Ficha clínica: dato de salud sensible (FICHA-CLINICA.md §11). PROPIETARIO e
// INSTRUCTOR ven el detalle clínico; RECEPCIÓN solo ve el color del semáforo
// (no el motivo ni las condiciones). Es una barrera de UI; la fuente de verdad
// se protege también en servidor.
export function puedeVerFichaClinica(rol: Rol): boolean {
  return rol === 'PROPIETARIO' || rol === 'INSTRUCTOR';
}

export function puedeVer(rol: Rol, path: string): boolean {
  if (rol === 'PROPIETARIO') return true;
  if (rol === 'INSTRUCTOR') return PERMITIDO_INSTRUCTOR.some(p => coincide(path, p));
  return !BLOQUEADO_RECEPCION.some(p => coincide(path, p));
}

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

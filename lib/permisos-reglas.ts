// Las REGLAS de permisos, sin React y sin Supabase.
//
// Estaban dentro de `lib/permisos.ts`, que es `'use client'` y arrastra
// `useStudio` → el cliente de Supabase. Consecuencia: no se podían probar sin
// levantar medio entorno, y una regla de permisos que nadie puede comprobar es
// justo la que no debería existir. Aquí son funciones puras; `lib/permisos.ts`
// las reexporta, así que ningún import de fuera cambia.

import { esRutaCongelada } from './frozen-features';
import type { Rol } from './types';

// Instructoras: su agenda, sus alumnas y las herramientas de contenido/equipo
// — nada de cobros, informes, marketing ni ajustes del negocio.
// CONGELADO (feature-freeze PMF): se quitaron '/ondemand' y '/comunidad' de esta
// lista blanca — ya no son visibles para nadie. Reactivar = volver a añadirlos.
const PERMITIDO_INSTRUCTOR = [
  '/dashboard', '/calendario', '/citas', '/clientas', '/mensajeria',
];

// Recepción: todo lo operativo, nada de configuración del negocio,
// marketing, automatizaciones, informes o gestión del equipo.
// '/centro-de-control' (Decision OS, MVP): solo PROPIETARIO — la apertura
// parcial a RECEPCION se decidirá post-MVP (DECISION-OS-ANALISIS.md §8).
const BLOQUEADO_RECEPCION = ['/equipo', '/marketing', '/contenido', '/automatizaciones', '/informes', '/configuracion', '/centro-de-control'];

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

// Mover dinero: crear cobros, marcarlos cobrados, asignar o cancelar planes.
// La propietaria y recepción — recepción cobra en mostrador y vende bonos, así
// que necesita poder de verdad. La instructora no: no tiene ningún motivo para
// tocar la facturación, y hasta la migración 0107 podía (la separación de roles
// estaba en el menú, no en la base de datos).
//
// Esto es la barrera de UI y su ÚNICO trabajo es no enseñar un botón que la
// base de datos va a rechazar. La cerradura está en la RLS (0107).
export function puedeMoverDinero(rol: Rol): boolean {
  return rol === 'PROPIETARIO' || rol === 'RECEPCION';
}

export function puedeVer(rol: Rol, path: string): boolean {
  // Feature-freeze PMF: los módulos congelados no son visibles para NINGÚN rol.
  // Esto los saca a la vez del menú, del buscador ⌘K y hace que el guardia del
  // layout redirija a /dashboard. Reactivar = quitar la ruta de RUTAS_CONGELADAS.
  if (esRutaCongelada(path)) return false;
  if (rol === 'PROPIETARIO') return true;
  if (rol === 'INSTRUCTOR') return PERMITIDO_INSTRUCTOR.some(p => coincide(path, p));
  return !BLOQUEADO_RECEPCION.some(p => coincide(path, p));
}

// Las REGLAS de permisos, sin React y sin Supabase.
//
// Estaban dentro de `lib/permisos.ts`, que es `'use client'` y arrastra
// `useStudio` → el cliente de Supabase. Consecuencia: no se podían probar sin
// levantar medio entorno, y una regla de permisos que nadie puede comprobar es
// justo la que no debería existir. Aquí son funciones puras; `lib/permisos.ts`
// las reexporta, así que ningún import de fuera cambia.

// La extensión .ts no sobra: `npm test` corre con `node --test
// --experimental-strip-types`, que no resuelve extensiones como el bundler. Sin
// ella el test ni siquiera importa el módulo (y pasó en CI, no en local, porque
// local usaba tsx). Turbopack la acepta —build de producción comprobada— y
// `allowImportingTsExtensions` está activo en tsconfig.
import { esRutaCongelada } from './frozen-features.ts';
import type { Rol } from './types';

// Instructoras: su agenda, sus alumnas y las herramientas de contenido/equipo
// — nada de cobros, informes, marketing ni ajustes del negocio.
// CONGELADO (feature-freeze PMF): se quitaron '/ondemand' y '/comunidad' de esta
// lista blanca — ya no son visibles para nadie. Reactivar = volver a añadirlos.
const PERMITIDO_INSTRUCTOR = [
  '/dashboard', '/calendario', '/citas', '/clientas', '/mensajeria',
];

// ⚠️ La lista blanca de arriba se compara POR PREFIJO, así que cada ruta abre
// también a todas sus hijas. Eso coló seis pantallas de importación enteras a la
// instructora —/clientas/importar, /citas/importar, /calendario/importar y sus
// hijas— porque sus padres sí están permitidos. Importar es trabajo de
// mostrador: mueve el alta masiva de clientas, horario, citas, reservas y bonos.
// El servidor ya las rechazaba (puedeGestionarClientas / puedeMoverDinero en cada
// ruta de API); lo que sobraba era la pantalla que llevaba hasta el rechazo.
const BLOQUEADO_INSTRUCTOR = [
  '/clientas/importar', '/citas/importar', '/calendario/importar',
];

// Recepción: todo lo operativo, nada de configuración del negocio,
// marketing, automatizaciones, informes o gestión del equipo.
// '/centro-de-control' (Decision OS, MVP): solo PROPIETARIO — la apertura
// parcial a RECEPCION se decidirá post-MVP (DECISION-OS-ANALISIS.md §8).
const BLOQUEADO_RECEPCION = ['/equipo', '/marketing', '/contenido', '/automatizaciones', '/informes', '/configuracion', '/centro-de-control'];

// Manager: lleva una sede. Todo lo operativo de recepción MÁS el equipo, y
// MENOS el dinero — incluida la pantalla de cobros, que recepción sí ve porque
// cobra en mostrador y un manager no.
// ⚠️ Las pantallas del dinero se consolidaron dentro de /cobros y esta lista se
// quedó apuntando a '/transacciones', que hoy es solo un redirect (ver
// app/(dashboard)/transacciones/page.tsx). Resultado: el manager tenía /cobros y
// /cierre abiertos, y en el menú lateral. Se bloquea la pantalla REAL y además
// los alias, que siguen existiendo porque son urls de retorno vivas de Stripe.
const BLOQUEADO_MANAGER = [
  '/marketing', '/contenido', '/automatizaciones', '/informes', '/configuracion',
  '/centro-de-control',
  '/cobros', '/cierre',
  '/transacciones', '/facturas', '/pagos',
  // Importar membresías es meter BONOS: dinero cobrado. Su ruta de API ya exige
  // `puedeMoverDinero` (app/api/suscripciones/import), que deja fuera al manager
  // igual que la deja fuera de /cobros. El resto de importaciones sí las hace.
  '/clientas/importar/membresias',
];

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

// VER la facturación (la pestaña Pagos de una ficha, el gasto total). Es otra
// pregunta que `puedeMoverDinero`, aunque hoy la respuesta coincida: se pueden
// separar el día que alguien tenga que consultar sin poder tocar.
// Antes esto se escribía a mano como `rol !== 'INSTRUCTOR'`, que con un rol
// nuevo se equivoca sola: un manager habría heredado la vista de finanzas.
export function puedeVerFinanzas(rol: Rol): boolean {
  return rol === 'PROPIETARIO' || rol === 'RECEPCION';
}

// Dar de alta, importar, editar y dar de baja CLIENTAS. Es el trabajo de
// mostrador, y el manager lo hace.
export function puedeGestionarClientas(rol: Rol): boolean {
  return rol === 'PROPIETARIO' || rol === 'RECEPCION' || rol === 'MANAGER';
}

// Dar de alta y editar al EQUIPO. Es lo que distingue a un manager de recepción,
// y el permiso más delicado que hay: con él se pueden repartir permisos. Que un
// manager no pueda ascender a nadie NO se defiende aquí — se defiende en la RLS
// (migración 0108), porque esto es solo la UI.
export function puedeGestionarEquipo(rol: Rol): boolean {
  return rol === 'PROPIETARIO' || rol === 'MANAGER';
}

// Roles que un rol puede REPARTIR al invitar o editar a alguien. La propietaria
// reparte todo; el manager solo hacia abajo. Espejo de la policy 0108: si las
// dos dejan de coincidir, la UI ofrece algo que la base de datos rechaza.
export function rolesQuePuedeAsignar(rol: Rol): Rol[] {
  if (rol === 'PROPIETARIO') return ['PROPIETARIO', 'MANAGER', 'RECEPCION', 'INSTRUCTOR'];
  if (rol === 'MANAGER') return ['RECEPCION', 'INSTRUCTOR'];
  return [];
}

export function puedeVer(rol: Rol, path: string): boolean {
  // Feature-freeze PMF: los módulos congelados no son visibles para NINGÚN rol.
  // Esto los saca a la vez del menú, del buscador ⌘K y hace que el guardia del
  // layout redirija a /dashboard. Reactivar = quitar la ruta de RUTAS_CONGELADAS.
  if (esRutaCongelada(path)) return false;
  if (rol === 'PROPIETARIO') return true;
  if (rol === 'INSTRUCTOR') {
    if (BLOQUEADO_INSTRUCTOR.some(p => coincide(path, p))) return false;
    return PERMITIDO_INSTRUCTOR.some(p => coincide(path, p));
  }
  if (rol === 'MANAGER') return !BLOQUEADO_MANAGER.some(p => coincide(path, p));
  return !BLOQUEADO_RECEPCION.some(p => coincide(path, p));
}

// Quién puede ESCRIBIR (subir, sustituir, borrar) cada ruta del bucket público
// `avatars`. Espejo TS de `public.avatars_path_escribible` (migración
// 20260913161200) — sin imports para poder probarlo con `node --test`, y con un
// test de contrato que compara esta tabla con el SQL.
//
// Antes una sola función (`avatars_path_autorizado`) decidía lectura y escritura
// solo por pertenecer al estudio, sin rol. La LECTURA sigue igual; lo que cambia
// es la escritura, que ahora exige el mismo rol que el panel.
//
// Criterio de cada tipo = quién hace hoy esa subida en el panel:
//   - marca/portal (logo, favicon, favicon-borrador, bienvenida, portal, banner,
//     clase, claselogo): /configuracion y el editor de apariencia →
//     PROPIETARIO y MANAGER (`puedeGestionarPortalHome`, RLS de
//     `contenido_portal_banners`).
//   - admin-<studio>: foto de perfil de la propietaria (tab-perfil sin ficha
//     de equipo) → solo PROPIETARIO.
//   - producto-<id>: /productos, que exige `puedeMoverDinero` igual que la RLS
//     de `productos_pos` → PROPIETARIO y RECEPCION.
//   - instructor-<id>: la propia instructora (tab-perfil de /mi-perfil) o quien
//     puede gestionar SU ficha (`puede_gestionar_ficha_instructor`: la
//     propietaria, o el manager sobre INSTRUCTOR/RECEPCION).
//   - network-<perfil>: solo la dueña del perfil (sin cambios).
//   - <socio_id>: la propia socia o `puede_gestionar_clientas()`.

export type Rol = 'PROPIETARIO' | 'MANAGER' | 'RECEPCION' | 'INSTRUCTOR';

export type TipoRutaAvatar =
  | 'favicon-borrador' | 'portal' | 'admin' | 'marca' | 'instructor' | 'network'
  | 'claselogo' | 'clase' | 'banner' | 'producto' | 'socia';

/** Mismo orden de ramas que el SQL: `favicon-borrador-` va antes que `favicon-`, `claselogo-` antes que `clase-`. */
export function clasificarRutaAvatar(nombre: string): TipoRutaAvatar {
  if (nombre.startsWith('favicon-borrador-')) return 'favicon-borrador';
  if (nombre.startsWith('portal-')) return 'portal';
  if (nombre.startsWith('admin-')) return 'admin';
  if (nombre.startsWith('logo-') || nombre.startsWith('favicon-') || nombre.startsWith('bienvenida-')) return 'marca';
  if (nombre.startsWith('instructor-')) return 'instructor';
  if (nombre.startsWith('network-')) return 'network';
  if (nombre.startsWith('claselogo-')) return 'claselogo';
  if (nombre.startsWith('clase-')) return 'clase';
  if (nombre.startsWith('banner-')) return 'banner';
  if (nombre.startsWith('producto-')) return 'producto';
  return 'socia';
}

/** Roles de staff que escriben cada tipo (además de la dueña, en los tipos «propios»). */
export const ROLES_ESCRITURA: Record<TipoRutaAvatar, readonly Rol[]> = {
  'favicon-borrador': ['PROPIETARIO', 'MANAGER'],
  portal: ['PROPIETARIO', 'MANAGER'],
  marca: ['PROPIETARIO', 'MANAGER'],
  claselogo: ['PROPIETARIO', 'MANAGER'],
  clase: ['PROPIETARIO', 'MANAGER'],
  banner: ['PROPIETARIO', 'MANAGER'],
  admin: ['PROPIETARIO'],
  producto: ['PROPIETARIO', 'RECEPCION'],
  // Gestionar la ficha de otra: la propietaria siempre; el manager solo sobre
  // INSTRUCTOR/RECEPCION (ver `rolFichaInstructora`).
  instructor: ['PROPIETARIO', 'MANAGER'],
  network: [],
  socia: ['PROPIETARIO', 'MANAGER', 'RECEPCION'],
};

/**
 * ¿Puede esta sesión escribir la ruta? `esDelEstudio` = el objeto referenciado
 * (estudio, tipo de clase, banner, producto, ficha) es del estudio activo;
 * `esPropia` = es la foto de la propia persona (su ficha de instructora, su
 * perfil de Network o su ficha de socia).
 */
export function puedeEscribirRutaAvatar(p: {
  nombre: string;
  rol: Rol | null;
  esDelEstudio: boolean;
  esPropia: boolean;
  /** Solo para `instructor-`: rol de la ficha cuya foto se toca. */
  rolFichaInstructora?: Rol | null;
}): boolean {
  const tipo = clasificarRutaAvatar(p.nombre);
  if (tipo === 'network') return p.esPropia;
  if ((tipo === 'instructor' || tipo === 'socia') && p.esPropia) return true;
  if (!p.esDelEstudio || !p.rol) return false;
  if (!ROLES_ESCRITURA[tipo].includes(p.rol)) return false;
  if (tipo === 'instructor' && p.rol === 'MANAGER') {
    return p.rolFichaInstructora === 'INSTRUCTOR' || p.rolFichaInstructora === 'RECEPCION';
  }
  return true;
}

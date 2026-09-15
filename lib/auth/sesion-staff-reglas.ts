// Qué estudio y qué rol le tocan a una cuenta de staff, sin Supabase para que se
// pueda probar sola (`npm test`). La aplica `verificarSesionStaff`
// (lib/auth-server.ts), que corre con SERVICE-ROLE y se salta la RLS entera:
// aquí no hay red de seguridad debajo, esto ES la cerradura de las rutas de API.
//
// Tiene que resolver lo MISMO que `current_studio_id()`/`current_rol()` en SQL
// (migr 0130). Si divergen, la base de datos y el servidor atienden a la misma
// persona en dos estudios distintos.

export type RolStaff = 'PROPIETARIO' | 'RECEPCION' | 'INSTRUCTOR' | 'MANAGER';

export interface SesionStaff {
  userId: string;
  studioId: string;
  rol: RolStaff;
  // Nombre para mostrar (instructora → su nombre; propietaria → nombre del estudio).
  nombre: string;
  // Email de la cuenta autenticada (no el del estudio). Lo usan rutas que
  // necesitan escribir AL usuario logueado — p. ej. el envío de prueba de una
  // plantilla de email (P2-11): nunca a un destinatario que venga del body.
  email: string | null;
}

export interface FichaEquipo {
  studio_id: string;
  rol: Exclude<RolStaff, 'PROPIETARIO'>;
  nombre: string | null;
  activo: boolean | null;
}

export interface EstudioPropio {
  id: string;
  nombre: string | null;
}

/**
 * `coalesce(activo, true)`: solo una baja EXPLÍCITA revoca.
 *
 * ⚠️ No vale `.neq('activo', false)` en la consulta: en SQL `null <> false` no es
 * verdad, así que deja fuera el nulo que la 0130 deja dentro. Con una sede
 * guardada sobre una ficha a nulo, la base de datos la respetaba y el servidor
 * no. Por eso se filtra aquí, con el nulo a la vista.
 */
export function fichaDeEquipoActiva(activo: boolean | null | undefined): boolean {
  return activo !== false;
}

/**
 * Mismo orden que `current_studio_id()`: la sede de `sesion_activa` si sigue
 * siendo suya (ficha activa o estudio propio); si no, su primera ficha activa
 * por `studio_id`; y solo después, su primer estudio propio por `id`.
 *
 * Espera las filas del usuario YA ordenadas (fichas por `studio_id`, estudios
 * por `id`), con `activo` sin filtrar.
 */
export function resolverSesionStaff(p: {
  userId: string;
  email: string | null;
  sedeGuardada: string | null | undefined;
  fichas: readonly FichaEquipo[] | null | undefined;
  estudiosPropios: readonly EstudioPropio[] | null | undefined;
}): SesionStaff | null {
  const { userId, email } = p;
  const fichas = (p.fichas ?? []).filter(f => fichaDeEquipoActiva(f.activo));
  const propios = p.estudiosPropios ?? [];

  const deFicha = (f: FichaEquipo): SesionStaff =>
    ({ userId, studioId: f.studio_id, rol: f.rol, nombre: f.nombre || 'Equipo', email });
  const dePropio = (s: EstudioPropio): SesionStaff =>
    ({ userId, studioId: s.id, rol: 'PROPIETARIO', nombre: s.nombre || 'Estudio', email });

  // Una sede guardada que ya no es suya (baja, cadena borrada) no aparece entre
  // sus filas y se cae al criterio determinista.
  if (p.sedeGuardada) {
    const ficha = fichas.find(f => f.studio_id === p.sedeGuardada);
    if (ficha) return deFicha(ficha);
    const propio = propios.find(s => s.id === p.sedeGuardada);
    if (propio) return dePropio(propio);
  }

  if (fichas[0]) return deFicha(fichas[0]);
  if (propios[0]) return dePropio(propios[0]);
  return null;
}

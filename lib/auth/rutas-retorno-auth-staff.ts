// Las rutas a las que puede volver un enlace de Supabase Auth del EQUIPO
// (confirmación de alta, recuperación de contraseña, Google). El porqué de cada
// una está en `lib/db/supabase.ts`.
//
// La consultan los DOS clientes de auth del navegador, al revés el uno del otro:
// el de staff solo lee tokens de la URL en estas rutas, y el del portal de socias
// nunca en ellas. El fragmento `#access_token=…` de un enlace es de UN cliente:
// si los dos lo canjean, el que termina primero lo borra de la URL y el otro se
// queda sin él — así es como un enlace de recuperación válido acababa en «Este
// enlace ya no vale» de vez en cuando.
export const RUTAS_RETORNO_AUTH_STAFF: ReadonlySet<string> = new Set(['/login', '/clave-nueva', '/network/acceso']);

/** ¿La página se ha cargado en una ruta de retorno de un enlace de auth del equipo? */
export function esRetornoAuthStaff(pathname: string | null | undefined): boolean {
  return !!pathname && RUTAS_RETORNO_AUTH_STAFF.has(pathname);
}

// De las claims de un JWT de Supabase ya verificado en local (`auth.getClaims`)
// a quién es la persona. Puro, para poder probarlo sin red.
//
// Por qué existe: ver `resolverSesionStaffConPaso` en lib/auth-server.ts y la
// migración 20261006120000 (factores_mfa_de).

export interface IdentidadDeClaims {
  id: string;
  email: string | null;
}

/**
 * `null` si el token no es de una persona. La clave anónima y la de
 * service-role también son JWT válidos de este proyecto, pero no llevan `sub`
 * ni tienen rol `authenticated`: no son nadie.
 */
export function identidadDeClaims(claims: Record<string, unknown> | null | undefined): IdentidadDeClaims | null {
  if (!claims) return null;
  if (claims.role !== 'authenticated') return null;
  if (typeof claims.sub !== 'string' || !claims.sub) return null;
  return { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : null };
}

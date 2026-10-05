// Quién tiene la sesión de la app de la alumna EN ESTE DISPOSITIVO, sin esperar
// a nada: se lee del almacén donde auth-js la guarda (`almacenSesionPortal`,
// clave `sb-portal-auth`, la misma que usa `lib/db/supabase-portal.ts`).
//
// Existe porque `supabasePortal.auth.getSession()` es asíncrono, y lo que lo
// necesita tiene que decidir en el PRIMER render si lo guardado es de quien está
// delante (`useAsync` con `clave`, la sesión recordada de `useSesionWidget`).
// No valida el token —eso lo hace el servidor en cada petición—: solo dice de
// quién es lo que hay guardado.

import { almacenSesionPortal } from '../db/portal-almacen-sesion.ts';
import { personaDeSesionGuardada } from './memoria-vistas.ts';

const CLAVE_SESION = 'sb-portal-auth';

/** El id de usuario de la sesión guardada; `null` sin sesión o en el servidor. */
export function personaEnElDispositivo(): string | null {
  if (typeof window === 'undefined') return null;
  return personaDeSesionGuardada(almacenSesionPortal.getItem(CLAVE_SESION));
}

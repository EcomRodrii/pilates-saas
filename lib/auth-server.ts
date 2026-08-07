import type { NextRequest } from 'next/server';
import { supabase } from '@/lib/db/supabase';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

export interface SesionStaff {
  userId: string;
  studioId: string;
  rol: 'PROPIETARIO' | 'RECEPCION' | 'INSTRUCTOR' | 'MANAGER';
  // Nombre para mostrar (instructora → su nombre; propietaria → nombre del estudio).
  nombre: string;
  // Email de la cuenta autenticada (no el del estudio). Lo usan rutas que
  // necesitan escribir AL usuario logueado — p. ej. el envío de prueba de una
  // plantilla de email (P2-11): nunca a un destinatario que venga del body.
  email: string | null;
}

// Verifica el JWT que el cliente manda en el header Authorization (obtenido
// de supabase.auth.getSession() en el navegador) y resuelve a qué negocio
// pertenece y con qué rol — el mismo criterio que current_studio_id()/
// current_rol() en SQL, pero en una ruta de servidor.
export async function verificarSesionStaff(req: NextRequest): Promise<SesionStaff | null> {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer /, '');
  if (!token) return null;

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  // A-1: el JWT ya se validó arriba (getUser). La RESOLUCIÓN de rol/estudio se
  // hace con service-role: la tabla `instructores` no tiene política anon, así
  // que con el cliente anónimo (sin sesión en servidor) la lectura volvía vacía
  // y RECEPCION/INSTRUCTOR NUNCA resolvían —solo el dueño, vía public_read_studios—
  // devolviendo 401 a todo el staff no-propietario. Fallback al anónimo si no
  // hay service-role, para no cambiar el comportamiento del dueño.
  const db = getSupabaseAdmin() ?? supabase;

  // Sede activa elegida explícitamente (selector multi-sede de una cadena) —
  // se usa con service-role, así que la validación de acceso hay que hacerla
  // aquí en TS (mismo criterio que current_studio_id() en SQL, que sí puede
  // apoyarse en RLS/auth.uid() porque corre dentro de la sesión del usuario).
  // Si la sede elegida ya no pertenece al usuario (revocado, cadena borrada),
  // se ignora sin más y cae al criterio determinista de siempre.
  // Las TRES lecturas van en paralelo y se resuelven en memoria.
  //
  // Antes eran hasta CUATRO viajes en serie: `sesion_activa`, luego —según lo
  // que devolviera— `instructores` y `studios` acotados a esa sede, o si no
  // `instructores` y después `studios`. Y esto lo ejecuta la PRIMERA LÍNEA de
  // cada ruta de staff, así que se pagaba entero en cada llamada: medido en
  // producción, /api/billing/status tardaba 2.265 ms y /api/layout 1.191 ms
  // siendo consultas triviales — el tiempo se iba aquí, no en su trabajo.
  //
  // Los tres son lecturas independientes del MISMO usuario, así que nada obliga
  // a encadenarlas. Se piden todas las filas (sin `limit(1)`) porque la
  // resolución de "sede activa" necesita poder buscar una sede concreta entre
  // ellas; una persona tiene una o dos, no es volumen.
  //
  // ⚠️ Lo que NO cambia, y no puede cambiar:
  //   · `neq('activo', false)` sobre instructores. Este camino corre con
  //     SERVICE-ROLE, que se salta la RLS entera: sin ese filtro, la migración
  //     0130 cerraría la puerta de la base de datos y las rutas de API
  //     seguirían abriendo la suya. Y es `neq(false)` y no `eq(true)` a
  //     propósito: solo una baja EXPLÍCITA revoca, un nulo accidental no deja
  //     a nadie fuera (mismo criterio que el `coalesce(activo, true)` de 0130).
  //   · El ORDEN (`studio_id` / `id` ascendente) para que, con varias sedes,
  //     se elija siempre la misma de forma determinista.
  const [{ data: activa }, { data: instructores }, { data: studios }] = await Promise.all([
    db.from('sesion_activa').select('studio_id').eq('auth_user_id', user.id).maybeSingle(),
    db.from('instructores').select('studio_id, rol, nombre')
      .eq('auth_user_id', user.id).neq('activo', false).order('studio_id', { ascending: true }),
    db.from('studios').select('id, nombre')
      .eq('owner_auth_user_id', user.id).order('id', { ascending: true }),
  ]);

  // Sede activa elegida explícitamente (selector multi-sede de una cadena). Se
  // resuelve con service-role, así que la validación de acceso se hace aquí en
  // TS: si la sede elegida ya no pertenece al usuario (revocada, cadena
  // borrada), simplemente no aparece entre sus filas y se cae al criterio
  // determinista de siempre.
  const sedeActiva = activa?.studio_id as string | undefined;
  if (sedeActiva) {
    const comoInstructor = instructores?.find(i => i.studio_id === sedeActiva);
    if (comoInstructor) {
      return { userId: user.id, studioId: sedeActiva, rol: comoInstructor.rol, nombre: comoInstructor.nombre || 'Equipo', email: user.email ?? null };
    }
    const comoOwner = studios?.find(s => s.id === sedeActiva);
    if (comoOwner) {
      return { userId: user.id, studioId: sedeActiva, rol: 'PROPIETARIO', nombre: comoOwner.nombre || 'Estudio', email: user.email ?? null };
    }
  }

  const instructor = instructores?.[0];
  if (instructor) {
    return { userId: user.id, studioId: instructor.studio_id, rol: instructor.rol, nombre: instructor.nombre || 'Equipo', email: user.email ?? null };
  }

  const studio = studios?.[0];
  if (studio) {
    return { userId: user.id, studioId: studio.id, rol: 'PROPIETARIO', nombre: studio.nombre || 'Estudio', email: user.email ?? null };
  }

  return null;
}

// Verifica el JWT de una SOCIA (portal de miembros con Supabase Auth) y
// devuelve su usuario de auth. No resuelve a qué estudio/socia pertenece —de
// eso se encarga resolverSociaAutenticada() con el slug del portal, porque un
// mismo email puede ser socia de varios estudios. Devuelve null si no hay token
// válido o el usuario no tiene email.
export async function verificarUsuarioSupabase(
  req: NextRequest,
): Promise<{ userId: string; email: string } | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user?.email) return null;

  return { userId: user.id, email: user.email };
}

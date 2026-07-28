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
  const { data: activa } = await db
    .from('sesion_activa')
    .select('studio_id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (activa?.studio_id) {
    const [{ data: comoInstructor }, { data: comoOwner }] = await Promise.all([
      // `activo`: dar de baja tiene que revocar el acceso, y aquí importa el
      // doble — este camino corre con SERVICE-ROLE, que se salta la RLS entera.
      // Sin este filtro, la migración 0130 cerraría la puerta de la base de
      // datos y las rutas de API seguirían abriendo la suya.
      db.from('instructores').select('rol, nombre').eq('auth_user_id', user.id).eq('studio_id', activa.studio_id).neq('activo', false).maybeSingle(),
      db.from('studios').select('nombre').eq('owner_auth_user_id', user.id).eq('id', activa.studio_id).maybeSingle(),
    ]);
    if (comoInstructor) {
      return { userId: user.id, studioId: activa.studio_id, rol: comoInstructor.rol, nombre: comoInstructor.nombre || 'Equipo', email: user.email ?? null };
    }
    if (comoOwner) {
      return { userId: user.id, studioId: activa.studio_id, rol: 'PROPIETARIO', nombre: comoOwner.nombre || 'Estudio', email: user.email ?? null };
    }
  }

  // limit(1) en vez de maybeSingle(): un mismo usuario puede estar vinculado a
  // varios estudios (instructor en dos centros, o dueño de varias sedes —el plan
  // CADENA). maybeSingle() lanzaba error con >1 fila y bloqueaba el acceso. El
  // orden por id es determinista para elegir siempre el mismo estudio primario.
  const { data: instructores } = await db
    .from('instructores')
    .select('studio_id, rol, nombre')
    .eq('auth_user_id', user.id)
    // `neq('activo', false)` y no `eq('activo', true)`: solo una baja EXPLÍCITA
    // revoca. Un nulo accidental no debe dejar a nadie fuera sin que nadie lo
    // haya decidido — mismo criterio que el `coalesce(activo, true)` de la 0130.
    .neq('activo', false)
    .order('studio_id', { ascending: true })
    .limit(1);
  const instructor = instructores?.[0];
  if (instructor) {
    return { userId: user.id, studioId: instructor.studio_id, rol: instructor.rol, nombre: instructor.nombre || 'Equipo', email: user.email ?? null };
  }

  const { data: studios } = await db
    .from('studios')
    .select('id, nombre')
    .eq('owner_auth_user_id', user.id)
    .order('id', { ascending: true })
    .limit(1);
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

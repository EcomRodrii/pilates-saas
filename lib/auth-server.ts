import type { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/db/supabase';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { resolverSesionStaff, type EstudioPropio, type FichaEquipo, type SesionStaff } from '@/lib/auth/sesion-staff-reglas';
import { factoresVerificados, faltaSegundoPaso, pasoDobleFactor, type PasoDobleFactor } from '@/lib/auth/doble-factor-reglas';
import { nivelAutenticacion } from '@/lib/interno/mfa';
import { sesionDelToken } from '@/lib/auth/dispositivo-confianza-reglas';
import { sesionConfiada } from '@/lib/auth/dispositivo-confianza';

export type { SesionStaff };

/**
 * La sesión de staff de la petición, con lo que le falta de verificación en
 * dos pasos (lib/auth/doble-factor-reglas.ts). `verificarSesionStaff` es la que
 * usan las rutas: devuelve `null` si `paso` no es 'ok'. Esta, sin cortar, solo
 * la usan quien tiene que saber a dónde mandar a la persona (tras el login, la
 * pantalla de verificar), nunca para dar datos.
 */
export async function resolverSesionStaffConPaso(
  req: NextRequest,
): Promise<{ sesion: SesionStaff; paso: PasoDobleFactor; factores: number; estudioLoExige: boolean } | null> {
  const r = await usuarioConToken(req);
  return r ? resolverConUsuario(r.token, r.user) : null;
}

/**
 * El usuario del Bearer, ya validado con `getUser` (firma, caducidad y sesión
 * viva), junto al propio token: de él salen `aal` y `session_id`, que solo se
 * pueden leer de un token que haya pasado por aquí.
 */
export async function usuarioConToken(req: NextRequest): Promise<{ token: string; user: User } | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return { token, user };
}

// Verifica el JWT que el cliente manda en el header Authorization (obtenido
// de supabase.auth.getSession() en el navegador) y resuelve a qué negocio
// pertenece y con qué rol — el mismo criterio que current_studio_id()/
// current_rol() en SQL, pero en una ruta de servidor.
//
// Y exige la verificación en dos pasos a quien le toca (2-oct-2026): con la
// sesión sin verificar, `null`, igual que sin sesión. El panel manda antes a
// /verificar-acceso, así que en uso normal esto no llega a cortar a nadie.
export async function verificarSesionStaff(req: NextRequest): Promise<SesionStaff | null> {
  const r = await resolverSesionStaffConPaso(req);
  return r && r.paso === 'ok' ? r.sesion : null;
}

async function resolverConUsuario(
  token: string, user: { id: string; email?: string | null; factors?: { status?: string | null }[] | null },
): Promise<{ sesion: SesionStaff; paso: PasoDobleFactor; factores: number; estudioLoExige: boolean } | null> {
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
  //   · La baja de `instructores.activo` se aplica. Este camino corre con
  //     SERVICE-ROLE, que se salta la RLS entera: sin ese filtro, la migración
  //     0130 cerraría la puerta de la base de datos y las rutas de API
  //     seguirían abriendo la suya. Se trae `activo` sin filtrar y lo decide
  //     `resolverSesionStaff` con `coalesce(activo, true)`, igual que la 0130.
  //     Antes era `.neq('activo', false)` en la consulta, que en SQL deja fuera
  //     también el nulo: la sede guardada sobre esa ficha valía para la base de
  //     datos y no para el servidor.
  //   · El ORDEN (`studio_id` / `id` ascendente) para que, con varias sedes,
  //     se elija siempre la misma de forma determinista.
  //
  // Las dos últimas: qué estudios de esta persona exigen la verificación en dos
  // pasos. En paralelo con las demás para no añadir un viaje. Si fallan, falla
  // CERRADO (se da por exigida), salvo que la columna aún no exista (código
  // desplegado antes que su migración): entonces no la exige nadie todavía.
  //
  // Y la última: con la verificación activada y la sesión en `aal1`, ¿la confió
  // el servidor por un dispositivo recordado? (lib/auth/dispositivo-confianza.ts;
  // la base de datos se lo pregunta igual con `sesion_de_confianza()`). Solo con
  // service-role: sin él no se puede leer y la sesión sigue sin verificar.
  const factores = factoresVerificados(user.factors);
  const nivelToken = nivelAutenticacion(token);
  const admin = getSupabaseAdmin();
  const [{ data: activa }, { data: instructores }, { data: studios }, exigenPropios, exigenFichas, confiada] = await Promise.all([
    db.from('sesion_activa').select('studio_id').eq('auth_user_id', user.id).maybeSingle(),
    db.from('instructores').select('studio_id, rol, nombre, activo')
      .eq('auth_user_id', user.id).order('studio_id', { ascending: true }),
    db.from('studios').select('id, nombre')
      .eq('owner_auth_user_id', user.id).order('id', { ascending: true }),
    db.from('studios').select('id').eq('owner_auth_user_id', user.id).eq('exigir_doble_factor', true),
    db.from('instructores').select('studio_id, studios!inner(id)').eq('auth_user_id', user.id).eq('studios.exigir_doble_factor', true),
    nivelToken === 'aal1' && factores > 0 && admin
      ? sesionConfiada(admin, user.id, sesionDelToken(token))
      : Promise.resolve(false),
  ]);

  const sesion = resolverSesionStaff({
    userId: user.id,
    email: user.email ?? null,
    sedeGuardada: activa?.studio_id as string | undefined,
    fichas: instructores as FichaEquipo[] | null,
    estudiosPropios: studios as EstudioPropio[] | null,
  });
  if (!sesion) return null;

  const sinColumnaAun = (e: { message?: string } | null) => !!e && /exigir_doble_factor/.test(e.message ?? '') && /does not exist|no existe/i.test(e.message ?? '');
  const lecturaFallida = (exigenPropios.error && !sinColumnaAun(exigenPropios.error))
    || (exigenFichas.error && !sinColumnaAun(exigenFichas.error));
  const queLoExigen = new Set<string>([
    ...((exigenPropios.error ? [] : exigenPropios.data ?? []) as { id: string }[]).map(s => s.id),
    ...((exigenFichas.error ? [] : exigenFichas.data ?? []) as { studio_id: string }[]).map(f => f.studio_id),
  ]);
  const estudioLoExige = lecturaFallida || queLoExigen.has(sesion.studioId);
  // El `aal` sale del token que `getUser` acaba de validar (ver nivelAutenticacion).
  // Una sesión confiada por un dispositivo recordado cuenta como verificada.
  const nivel = nivelToken === 'aal2' || confiada ? 'aal2' : 'aal1';
  const paso = pasoDobleFactor({ nivel, factoresVerificados: factores, estudioLoExige, rol: sesion.rol });
  return { sesion, paso, factores, estudioLoExige };
}

// Verifica el JWT de una SOCIA (portal de miembros con Supabase Auth) y
// devuelve su usuario de auth. No resuelve a qué estudio/socia pertenece —de
// eso se encarga resolverSociaAutenticada() con el slug del portal, porque un
// mismo email puede ser socia de varios estudios. Devuelve null si no hay token
// válido o el usuario no tiene email.
//
// Y exige la verificación en dos pasos a quien la tiene activada (4-oct-2026):
// es la puerta de la app del estudio, `/reservar`, el widget, la red y los
// avisos (~85 rutas), y una contraseña robada no puede leer por aquí lo que el
// panel ya le niega. Quien NO la tiene activada no paga nada: los factores
// vienen en la misma respuesta de `getUser`, y la sesión confiada solo se
// pregunta si hay factor y la sesión está en `aal1`. Una ruta que tenga que
// contestar igualmente (decidir a dónde va la persona, la zona interna con su
// propio `aal2`) lo pide con `sinSegundoPaso`.
export async function verificarUsuarioSupabase(
  req: NextRequest,
  opciones: { sinSegundoPaso?: boolean } = {},
): Promise<{ userId: string; email: string } | null> {
  const r = await usuarioSupabaseConPaso(req);
  if (!r) return null;
  if (r.paso === 'doble_factor' && !opciones.sinSegundoPaso) return null;
  return r.usuario;
}

/**
 * Como `verificarUsuarioSupabase`, pero sin cortar: dice si a la sesión le
 * falta el segundo paso. Para las rutas de arranque, que tienen que contestar
 * `doble_factor_requerido` en vez de un 401 que el cliente leería como «sin
 * sesión» (y la mandaría a entrar otra vez, en bucle).
 */
export async function usuarioSupabaseConPaso(
  req: NextRequest,
): Promise<{ usuario: { userId: string; email: string }; paso: 'ok' | 'doble_factor' } | null> {
  const r = await usuarioConToken(req);
  if (!r?.user.email) return null;
  return { usuario: { userId: r.user.id, email: r.user.email }, paso: await pasoDeLaSesion(r.token, r.user) };
}

/**
 * ¿Le falta el segundo paso a este token ya validado con `getUser`? Fallo
 * cerrado: sin service role no se puede comprobar la confianza y se trata como
 * sin verificar (igual que `resolverConUsuario`).
 */
export async function pasoDeLaSesion(
  token: string, user: { id: string; factors?: { status?: string | null }[] | null },
): Promise<'ok' | 'doble_factor'> {
  const factores = factoresVerificados(user.factors);
  if (factores === 0) return 'ok';
  const nivel = nivelAutenticacion(token);
  if (nivel === 'aal2') return 'ok';
  const admin = getSupabaseAdmin();
  const confiada = admin ? await sesionConfiada(admin, user.id, sesionDelToken(token)) : false;
  return faltaSegundoPaso({ factoresVerificados: factores, nivel, confiada }) ? 'doble_factor' : 'ok';
}

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db/supabase';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { verificarTokenInstructora } from '@/lib/sustituciones/token';
import { enviarEmailAccesoActivado } from '@/lib/emails/acceso-activado-server';
import { MENSAJE_RECHAZO, motivoNoReclamable } from '@/lib/equipo/reclamar-reglas';
import type { Rol } from '@/lib/types';

const ROLES: readonly string[] = ['PROPIETARIO', 'INSTRUCTOR', 'RECEPCION', 'MANAGER'];

// POST /api/equipo/reclamar → vincula la cuenta recién creada con su ficha de
// equipo. Sustituye al self-claim que hacía el navegador contra la RLS y que
// NUNCA funcionó (el porqué, en la migración 0131).
//
// Va con service-role a propósito: el punto entero es que quien llama todavía no
// pertenece a ningún estudio, así que ninguna policy puede verle su fila. Como
// service-role se salta la RLS, aquí no hay nada debajo — las reglas de
// lib/equipo/reclamar-reglas.ts son la cerradura, no un adorno de la interfaz.
//
// No usa verificarSesionStaff: esa función resuelve estudio y rol A PARTIR de la
// ficha, que es justo lo que aún no existe. Se valida el JWT a pelo.
//
// EXIGE el enlace firmado del correo de invitación. Vincular por coincidencia de
// email —el diseño de partida— dejaba enganchar la cuenta de cualquiera desde un
// estudio recién creado, sin que la persona aceptara nada; el razonamiento
// completo está en reclamar-reglas.ts.
//
// Idempotente: el mismo enlace puede abrirse dos veces (un reenvío, un doble
// clic) y la segunda no hace nada ni se queja.
const ERROR_SISTEMA = 'No hemos podido activar tu acceso. Inténtalo de nuevo en unos segundos.';
const ENLACE_NO_VALIDO = 'Este enlace ya no vale. Pídele a tu estudio que te lo envíe de nuevo.';

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'equipo-reclamar', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const jwt = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!jwt) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { data: { user }, error: errAuth } = await supabase.auth.getUser(jwt);
  if (errAuth || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const token = typeof body?.token === 'string' ? body.token : null;
  if (!token) return errorPeticion(ENLACE_NO_VALIDO, 400);

  const claim = verificarTokenInstructora(token, 'invitacion');
  if (!claim) return errorPeticion(ENLACE_NO_VALIDO, 401);

  const admin = getSupabaseAdmin();
  if (!admin) return errorInterno('equipo:reclamar', new Error('sin service-role'), ERROR_SISTEMA);

  // `ref` lleva el rol de quien mandó la invitación (app/api/equipo/invitar).
  // Va DENTRO de la firma, así que no se puede subir a mano. Los enlaces
  // emitidos antes de esto no lo traen y se tratan como "no consta".
  const rolEmisor = ROLES.includes(claim.ref as Rol) ? (claim.ref as Rol) : null;

  const { data: ficha, error } = await admin
    .from('instructores')
    .select('id, nombre, rol, activo, auth_user_id, studio_id')
    .eq('id', claim.instructorId)
    .eq('studio_id', claim.studioId)
    .maybeSingle();
  if (error) return errorInterno('equipo:reclamar', error, ERROR_SISTEMA);
  if (!ficha) return errorPeticion(MENSAJE_RECHAZO.FICHA_INACTIVA, 404);

  const motivo = motivoNoReclamable(
    { rol: ficha.rol as Rol, activo: ficha.activo as boolean | null, authUserId: ficha.auth_user_id },
    user.id, rolEmisor,
  );
  if (motivo) {
    console.warn('[equipo:reclamar] rechazo', motivo, 'ficha', ficha.id, 'rol', ficha.rol, 'emisor', rolEmisor);
    // 409, no 403: son estados de negocio con su propio mensaje y su propia
    // acción siguiente ("pídeselo a la propietaria"), no un intento de acceso
    // no autorizado — mismo criterio 409 que el resto de rutas de este repo
    // (app/api/equipo/route.ts). Con 403 se colaban en Sentry como error de
    // app (JAVASCRIPT-NEXTJS-1N): esErrorDeRedCliente/esConflictoDeNegocioEsperado
    // en lib/supabase-data.ts solo filtra 409.
    return errorPeticion(MENSAJE_RECHAZO[motivo], motivo === 'FICHA_INACTIVA' ? 404 : 409);
  }

  // El `.is('auth_user_id', null)` es la carrera cerrada: si entre la lectura y
  // la escritura otra cuenta reclamó la ficha, este update no toca nada en vez
  // de pisarla. 0 filas ⇒ ya estaba vinculada, que para quien llama es lo mismo:
  // no hay nada nuevo que hacer.
  const { data: tocadas, error: errUpdate } = await admin
    .from('instructores')
    .update({ auth_user_id: user.id })
    .eq('id', ficha.id)
    .is('auth_user_id', null)
    .select('id');
  if (errUpdate) return errorInterno('equipo:reclamar', errUpdate, ERROR_SISTEMA);

  const nueva = (tocadas?.length ?? 0) > 0;
  if (nueva) {
    await avisarAlEstudio(admin, ficha.studio_id as string, ficha.nombre as string, user.email ?? null);
  }
  return NextResponse.json({ vinculadas: nueva ? 1 : 0, estudioId: ficha.studio_id });
}

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

// Avisar al estudio es la ÚNICA forma de detectar un email mal tecleado en la
// ficha: el enlace va al mismo buzón equivocado, así que si el acceso se activa
// con un correo que no es el que la dueña puso, alguien tiene que poder verlo.
// Best-effort: un email que no sale no puede tumbar una vinculación ya hecha.
async function avisarAlEstudio(admin: Admin, studioId: string, nombreFicha: string, emailCuenta: string | null) {
  try {
    const { data: studio } = await admin
      .from('studios')
      .select('nombre, email, color_primario, logo_url')
      .eq('id', studioId)
      .maybeSingle();
    if (!studio?.email) return;
    await enviarEmailAccesoActivado({
      to: studio.email as string,
      nombre: nombreFicha,
      emailCuenta,
      estudioNombre: (studio.nombre as string | null) ?? 'tu estudio',
      colorPrimario: studio.color_primario as string | null,
      logoUrl: studio.logo_url as string | null,
    });
  } catch (e) {
    console.error('[equipo:reclamar] aviso al estudio', e);
  }
}

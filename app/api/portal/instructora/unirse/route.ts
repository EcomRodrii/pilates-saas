import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db/supabase';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { resolverStudioPorSlug } from '@/lib/db/supabase-data-admin';
import { fichaInstructoraPendiente, instructoraActivaEnEstudio } from '@/lib/auth-instructora';
import { avisarAlEstudioAccesoActivado } from '@/lib/equipo/avisar-acceso-activado';
import { conservarEstudioDelPanel } from '@/lib/equipo/conservar-estudio-panel';
import { MENSAJE_RECHAZO, motivoNoReclamable } from '@/lib/equipo/reclamar-reglas';
import { verificarTokenInstructora } from '@/lib/sustituciones/token';
import { enlaceRevocado } from '@/lib/sustituciones/enlaces';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import type { Rol } from '@/lib/types';

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

// «Entrar como instructora» (decisión del fundador, 15-sep-2026).
//
// La propietaria da de alta a una instructora; cuando ella entra en la app del
// estudio, elige entrar como instructora o como alumna. Esta ruta es el primer
// botón: une su cuenta a su ficha. Llega por una de dos vías:
//
//   · Con el ENLACE de invitación (`token`): el correo de invitación de una
//     instructora lleva a la app, no al panel. El enlace firmado es la prueba,
//     igual que en `equipoReclamarAction`: vale con cualquier cuenta, y se
//     aplican las mismas reglas (`motivoNoReclamable`, enlace no revocado).
//   · Sin enlace, por su CORREO: la ficha pendiente con el correo del token de
//     sesión. Exige el correo verificado — es lo que el enlace demostraba.
//
// ⚠️ Es la otra puerta, junto al panel, por la que una cuenta se une a una ficha
// de equipo, y corre con service-role. Condiciones comunes, y por qué (el riesgo
// de fondo, en `lib/equipo/reclamar-reglas.ts`):
//   · Identidad del token de sesión; sede del SLUG; nada que decida sale del body
//     salvo el propio enlace firmado.
//   · Lo pulsa ella dentro de la app de ESE estudio. Nada se une solo al entrar.
//   · Solo fichas de rol INSTRUCTOR. El resto de roles trabaja en el panel.
//   · El UPDATE repite las condiciones: si dos peticiones compiten, una la une.
//   · Antes de unir, `conservarEstudioDelPanel`: unirse a otro estudio no puede
//     cambiarle a nadie el estudio en el que abre su panel (el caso real: una
//     propietaria que además da clase en otro estudio).
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'portal-instructora-unirse', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { slug?: unknown; token?: unknown } | null;
  const slug = typeof body?.slug === 'string' ? body.slug : '';
  const enlace = typeof body?.token === 'string' && body.token ? body.token : null;
  if (!slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });

  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { data: { user }, error: errAuth } = await supabase.auth.getUser(token);
    if (errAuth || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

    const resuelto = await resolverStudioPorSlug(admin as never, slug);
    if (!resuelto) return NextResponse.json({ error: 'No hemos encontrado el estudio.' }, { status: 404 });
    const studioId = (resuelto.row as { id: string }).id;

    // Repetir el botón no es un error: ya estaba hecho.
    if (await instructoraActivaEnEstudio(admin, user.id, studioId)) {
      return NextResponse.json({ ok: true, yaEra: true });
    }

    const ficha = enlace
      ? await fichaPorEnlace(admin, enlace, studioId, user.id)
      : await fichaPorCorreo(admin, user, studioId);
    if ('respuesta' in ficha) return ficha.respuesta;

    // UNIQUE(auth_user_id, studio_id): si ya tiene OTRA ficha aquí (gerencia,
    // recepción, o dada de baja), no se le añade una segunda — lo revisa el estudio.
    const { data: otra, error: errOtra } = await admin
      .from('instructores').select('id')
      .eq('studio_id', studioId).eq('auth_user_id', user.id)
      .limit(1);
    if (errOtra) throw errOtra;
    if ((otra ?? []).length > 0) return otroAcceso();

    await conservarEstudioDelPanel(admin, user.id);

    const { data: unidas, error: errUpdate } = await admin
      .from('instructores')
      .update({ auth_user_id: user.id })
      .eq('id', ficha.instructorId)
      .eq('studio_id', studioId)
      .eq('rol', 'INSTRUCTOR')
      .is('auth_user_id', null)
      .select('id');
    // 23505: otra vía (el panel) la ha unido a la vez en esta sede.
    if (errUpdate?.code === '23505') return otroAcceso();
    if (errUpdate) throw errUpdate;
    if ((unidas ?? []).length === 0) {
      return NextResponse.json(
        { error: 'Esta invitación ya no está disponible. Pídele a tu estudio que la revise.', code: 'SIN_INVITACION' },
        { status: 409 },
      );
    }

    await avisarAlEstudioAccesoActivado(admin, studioId, ficha.nombre, user.email ?? null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorInterno('portal/instructora/unirse:POST', err, 'No hemos podido activar tu acceso. Inténtalo de nuevo en unos segundos.');
  }
}

type Resultado = { instructorId: string; nombre: string } | { respuesta: NextResponse };

const ROLES: readonly string[] = ['PROPIETARIO', 'INSTRUCTOR', 'RECEPCION', 'MANAGER'];

/** Vía enlace: el token firmado de invitación, de ESTE estudio y vigente. */
async function fichaPorEnlace(admin: Admin, enlace: string, studioId: string, userId: string): Promise<Resultado> {
  const claim = verificarTokenInstructora(enlace, 'invitacion');
  if (!claim || claim.studioId !== studioId || await enlaceRevocado(admin, claim.instructorId, 'invitacion', enlace)) {
    return {
      respuesta: NextResponse.json(
        { error: 'Esta invitación ya no vale. Pídele a tu estudio que te la envíe de nuevo.', code: 'ENLACE_NO_VALIDO' },
        { status: 400 },
      ),
    };
  }
  const { data: fila, error } = await admin
    .from('instructores').select('id, nombre, rol, activo, auth_user_id')
    .eq('id', claim.instructorId).eq('studio_id', studioId)
    .maybeSingle();
  if (error) throw error;
  if (!fila) return sinInvitacion();
  if (fila.rol !== 'INSTRUCTOR') {
    return {
      respuesta: NextResponse.json(
        { error: 'Esta invitación es para el panel del estudio. Ábrela desde el correo en un ordenador.', code: 'ROL_DE_PANEL' },
        { status: 409 },
      ),
    };
  }
  const rolEmisor = ROLES.includes(claim.ref as Rol) ? (claim.ref as Rol) : null;
  const motivo = motivoNoReclamable(
    { rol: fila.rol as Rol, activo: fila.activo as boolean | null, authUserId: fila.auth_user_id as string | null },
    userId, rolEmisor,
  );
  if (motivo) {
    return { respuesta: NextResponse.json({ error: MENSAJE_RECHAZO[motivo], code: motivo }, { status: 409 }) };
  }
  return { instructorId: fila.id as string, nombre: (fila.nombre as string | null) || 'Instructora' };
}

/** Vía correo: la ficha pendiente con el correo VERIFICADO de la sesión. */
async function fichaPorCorreo(
  admin: Admin, user: { email?: string | null; email_confirmed_at?: string | null }, studioId: string,
): Promise<Resultado> {
  if (!user.email || !user.email_confirmed_at) {
    return {
      respuesta: NextResponse.json(
        { error: 'Antes tienes que confirmar tu correo. Entra con el enlace que te hemos enviado.', code: 'CORREO_SIN_CONFIRMAR' },
        { status: 403 },
      ),
    };
  }
  const ficha = await fichaInstructoraPendiente(admin, user.email, studioId);
  return ficha ?? sinInvitacion();
}

function sinInvitacion(): Resultado {
  return {
    respuesta: NextResponse.json(
      { error: 'En este estudio no hay ninguna invitación de instructora para ti.', code: 'SIN_INVITACION' },
      { status: 404 },
    ),
  };
}

function otroAcceso() {
  return NextResponse.json(
    { error: 'Tu cuenta ya tiene otro acceso en este estudio. Pídele al estudio que lo revise.', code: 'OTRO_ACCESO' },
    { status: 409 },
  );
}

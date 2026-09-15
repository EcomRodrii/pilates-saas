import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db/supabase';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { resolverStudioPorSlug } from '@/lib/db/supabase-data-admin';
import { fichaInstructoraPendiente, instructoraActivaEnEstudio } from '@/lib/auth-instructora';
import { avisarAlEstudioAccesoActivado } from '@/lib/equipo/avisar-acceso-activado';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

// «Entrar como instructora» (decisión del fundador, 15-sep-2026).
//
// La propietaria da de alta a una instructora con su correo; cuando ella entra
// en la app del estudio con ese correo, elige entrar como instructora o como
// alumna. Esta ruta es el primer botón: une su cuenta a esa ficha.
//
// ⚠️ Es la otra puerta, junto al enlace firmado de invitación, por la que una
// cuenta se une a una ficha de equipo, y corre con service-role. Condiciones, y
// por qué cada una (el riesgo de fondo está en `lib/equipo/reclamar-reglas.ts`):
//   · Correo VERIFICADO. Es lo que el enlace del correo demostraba: que la
//     dirección es suya. Sin confirmar, cualquiera se registra con un correo
//     ajeno.
//   · El correo sale del TOKEN, nunca del body, y la sede del SLUG.
//   · Lo pulsa ella dentro de la app de ESE estudio, con su nombre delante. Nada
//     se une solo al entrar: eso era el self-claim retirado (#471).
//   · Solo fichas de rol INSTRUCTOR, activas y sin cuenta. Recepción y gerencia
//     mueven dinero o gestionan: esas siguen yendo por invitación desde el panel.
//   · El UPDATE repite las condiciones (`auth_user_id is null`, rol, sede): si
//     dos peticiones compiten, solo una la une.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'portal-instructora-unirse', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { slug?: unknown } | null;
  const slug = typeof body?.slug === 'string' ? body.slug : '';
  if (!slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });

  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { data: { user }, error: errAuth } = await supabase.auth.getUser(token);
    if (errAuth || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    if (!user.email || !user.email_confirmed_at) {
      return NextResponse.json(
        { error: 'Antes tienes que confirmar tu correo. Entra con el enlace que te hemos enviado.', code: 'CORREO_SIN_CONFIRMAR' },
        { status: 403 },
      );
    }

    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

    const resuelto = await resolverStudioPorSlug(admin as never, slug);
    if (!resuelto) return NextResponse.json({ error: 'No hemos encontrado el estudio.' }, { status: 404 });
    const studioId = (resuelto.row as { id: string }).id;

    // Repetir el botón no es un error: ya estaba hecho.
    if (await instructoraActivaEnEstudio(admin, user.id, studioId)) {
      return NextResponse.json({ ok: true, yaEra: true });
    }

    const ficha = await fichaInstructoraPendiente(admin, user.email, studioId);
    if (!ficha) {
      return NextResponse.json(
        { error: 'En este estudio no hay ninguna invitación de instructora para tu correo.', code: 'SIN_INVITACION' },
        { status: 404 },
      );
    }

    // UNIQUE(auth_user_id, studio_id): si ya tiene OTRA ficha aquí (gerencia,
    // recepción, o dada de baja), no se le añade una segunda — lo revisa el estudio.
    const { data: otra, error: errOtra } = await admin
      .from('instructores').select('id')
      .eq('studio_id', studioId).eq('auth_user_id', user.id)
      .limit(1);
    if (errOtra) throw errOtra;
    if ((otra ?? []).length > 0) {
      return NextResponse.json(
        { error: 'Tu cuenta ya tiene otro acceso en este estudio. Pídele al estudio que lo revise.', code: 'OTRO_ACCESO' },
        { status: 409 },
      );
    }

    // ⚠️ Una cuenta PROPIETARIA de algún estudio no se une por aquí. Sin fila en
    // `sesion_activa`, `current_studio_id()` elige una ficha de equipo por
    // delante de su propio estudio: su panel podría abrirse en el de otra
    // persona. Para ella, el enlace de invitación del correo.
    const { data: suyos, error: errSuyos } = await admin
      .from('studios').select('id')
      .eq('owner_auth_user_id', user.id)
      .limit(1);
    if (errSuyos) throw errSuyos;
    if ((suyos ?? []).length > 0) {
      return NextResponse.json(
        { error: 'Tu cuenta es la de un estudio. Para entrar como instructora aquí, abre el enlace de invitación que te ha mandado este estudio.', code: 'CUENTA_DE_ESTUDIO' },
        { status: 409 },
      );
    }

    const { data: unidas, error: errUpdate } = await admin
      .from('instructores')
      .update({ auth_user_id: user.id })
      .eq('id', ficha.instructorId)
      .eq('studio_id', studioId)
      .eq('rol', 'INSTRUCTOR')
      .is('auth_user_id', null)
      .select('id');
    // 23505: otra vía (el enlace de invitación) la ha unido a la vez en esta sede.
    if (errUpdate?.code === '23505') {
      return NextResponse.json(
        { error: 'Tu cuenta ya tiene otro acceso en este estudio. Pídele al estudio que lo revise.', code: 'OTRO_ACCESO' },
        { status: 409 },
      );
    }
    if (errUpdate) throw errUpdate;
    if ((unidas ?? []).length === 0) {
      return NextResponse.json(
        { error: 'Esta invitación ya no está disponible. Pídele a tu estudio que la revise.', code: 'SIN_INVITACION' },
        { status: 409 },
      );
    }

    await avisarAlEstudioAccesoActivado(admin, studioId, ficha.nombre, user.email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorInterno('portal/instructora/unirse:POST', err, 'No hemos podido activar tu acceso. Inténtalo de nuevo en unos segundos.');
  }
}

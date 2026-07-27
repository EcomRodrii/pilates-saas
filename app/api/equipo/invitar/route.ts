import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enviarEmailInvitacionEquipo } from '@/lib/emails/invitacion-equipo-server';
import { puedeGestionarEquipo, rolesQuePuedeAsignar } from '@/lib/permisos-reglas';
import { firmarTokenInstructora } from '@/lib/sustituciones/token';

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
}

// POST /api/equipo/invitar → manda (o vuelve a mandar) el email de invitación a
// una ficha de equipo que YA existe.
//
// Antes esto vivía dentro del alta y salía solo al guardar. Separarlo es el
// punto: dar de alta a alguien y avisarle son dos decisiones, y la de avisar es
// de la dueña —ella elige el momento, que puede no ser un domingo a las once de
// la noche—. Mismo enforcement que el resto de /api/equipo: solo PROPIETARIO, y
// el estudio sale del JWT, nunca del body.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarEquipo(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para invitar al equipo' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const instructorId = typeof body?.instructorId === 'string' ? body.instructorId : null;
  if (!instructorId) {
    return NextResponse.json({ error: 'Falta a quién invitar' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return errorInterno('equipo:invitar', new Error('sin service-role'),
    'No se ha podido enviar la invitación. Inténtalo de nuevo en unos segundos.');

  // La ficha se lee SIEMPRE acotada al estudio del JWT: así una dueña no puede
  // disparar correos a nombre del equipo de otro estudio pasando un id ajeno.
  const { data: instructor } = await admin
    .from('instructores')
    .select('id, nombre, email, rol, auth_user_id')
    .eq('id', instructorId)
    .eq('studio_id', sesion.studioId)
    .maybeSingle();

  if (!instructor) {
    return NextResponse.json({ error: 'Esa persona ya no está en tu equipo.' }, { status: 404 });
  }
  // Un manager invita a su equipo, no a la propietaria ni a otro manager: dar
  // acceso a una cuenta con más permisos que los tuyos es escalada por la puerta
  // de atrás. Este endpoint usa service-role y se salta la RLS, así que la regla
  // se aplica aquí a mano.
  if (sesion.rol !== 'PROPIETARIO'
      && !rolesQuePuedeAsignar(sesion.rol).includes(instructor.rol as never)) {
    return NextResponse.json(
      { error: 'No puedes invitar a esta persona. Pídeselo a la propietaria.' },
      { status: 403 },
    );
  }
  if (!instructor.email) {
    return NextResponse.json(
      { error: 'Esa persona no tiene email en su ficha. Añádeselo y vuelve a intentarlo.' },
      { status: 400 },
    );
  }
  // Ya reclamó su cuenta: mandarle otra invitación solo la confundiría.
  if (instructor.auth_user_id) {
    return NextResponse.json(
      { error: 'Esa persona ya tiene su acceso creado, no necesita invitación.' },
      { status: 409 },
    );
  }

  const { data: studio } = await admin
    .from('studios')
    .select('nombre, color_primario, logo_url')
    .eq('id', sesion.studioId)
    .maybeSingle();

  try {
    await enviarEmailInvitacionEquipo({
      to: instructor.email as string,
      nombre: instructor.nombre as string,
      propietariaNombre: sesion.nombre,
      estudioNombre: studio?.nombre ?? 'tu estudio',
      colorPrimario: studio?.color_primario,
      logoUrl: studio?.logo_url,
      rol: instructor.rol as string,
      // Enlace CON TOKEN, no un /login pelado. El anterior no identificaba a
      // nadie: quien lo abría con otra sesión abierta acababa en su propio panel
      // sin enterarse de la invitación, y quien se registraba con otro correo se
      // creaba una cuenta suelta que no quedaba vinculada al estudio.
      url: `${appUrl()}/invitacion?token=${encodeURIComponent(
        firmarTokenInstructora(instructor.id as string, sesion.studioId, 'invitacion'),
      )}`,
    });
  } catch (e) {
    // El envío es best-effort por dentro, pero si revienta aquí la dueña TIENE
    // que enterarse: acaba de pulsar un botón que dice "enviar invitación".
    return errorInterno('equipo:invitar', e,
      'No se ha podido enviar la invitación. Inténtalo de nuevo en unos minutos.');
  }

  return NextResponse.json({ ok: true, email: instructor.email });
}

import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarClientas } from '@/lib/permisos-reglas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { validarConsultaManual } from '@/lib/contacto/consulta';
import { uid } from '@/lib/utils';
import { escaparLike } from '@/lib/escapar-like';

export const dynamic = 'force-dynamic';

// Apuntar a mano a una interesada (llamó, escribió por Instagram, pasó por la
// puerta). Va a `consultas_contacto`, como las del formulario de la web: no es
// una ficha y no recibe nada automático. La ficha la
// crean los caminos de siempre (darla de alta, que reserve o compre), y al
// crearse un trigger la enlaza con esta consulta.
//
// Con service_role: el rol, el estudio (de la sesión) y quién la apuntó los pone
// esta ruta. Si ya hay una clienta con ese email, no se duplica: 409 con su id.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para apuntar interesadas.' }, { status: 403 });
  }
  const limited = await enforceRateLimit(req, 'consultas-manual', { max: 30, windowSeconds: 60 }, sesion.studioId);
  if (limited) return limited;

  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const validacion = validarConsultaManual(cuerpo ?? {});
  if (!validacion.ok) return NextResponse.json({ error: validacion.error }, { status: 400 });
  const { nombre, email, telefono, canal, mensaje } = validacion.consulta;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    if (email) {
      const { data: yaEs, error: errYa } = await admin.from('socios')
        .select('id').eq('studio_id', sesion.studioId).ilike('email', escaparLike(email)).is('borrado_en', null).limit(1);
      if (errYa) return errorInterno('consultas:ya-es', errYa, 'No se ha podido comprobar si ya es clienta. Vuelve a intentarlo.');
      if (yaEs && yaEs.length > 0) {
        return NextResponse.json({ error: 'Ya es clienta: tiene ficha con ese email.', socioId: yaEs[0].id }, { status: 409 });
      }
    }

    const id = uid();
    const { error } = await admin.from('consultas_contacto').insert({
      id,
      studio_id: sesion.studioId,
      nombre,
      email,
      telefono,
      mensaje,
      canal,
      registrada_por: sesion.userId,
      estado: 'nueva',
    });
    if (error) return errorInterno('consultas:apuntar', error, 'No se ha podido apuntar. Vuelve a intentarlo.');
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return errorInterno('consultas:apuntar', e, 'No se ha podido apuntar. Vuelve a intentarlo.');
  }
}

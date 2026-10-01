import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarClientas } from '@/lib/permisos-reglas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { validarSeguimiento } from '@/lib/clientas/seguimientos';
import { hoyEnEstudio, uid } from '@/lib/utils';
import { cuentaDelEquipo } from '@/lib/clientas/equipo-servidor';

export const dynamic = 'force-dynamic';

// Crear un seguimiento de una clienta («Recuérdamelo»): una tarea con fecha, en
// `tareas`. La lectura la hace el panel con su sesión (RLS: quien gestiona
// clientas); escribir solo aquí, con service_role, así que lo que haría la RLS
// lo hace esta ruta: rol, estudio de la sesión, la socia es de ese estudio, la
// persona a la que se asigna es del equipo y gestiona clientas, y el aviso del
// que nace (si nace de uno) es de esta socia.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para crear seguimientos de clientas.' }, { status: 403 });
  }
  const limited = await enforceRateLimit(req, 'seguimientos', { max: 60, windowSeconds: 60 }, sesion.studioId);
  if (limited) return limited;

  const validacion = validarSeguimiento(await req.json().catch(() => null), hoyEnEstudio(new Date()));
  if (!validacion.ok) return NextResponse.json({ error: validacion.error }, { status: 400 });
  const { socioId, titulo, venceEl, recomendacionId } = validacion.seguimiento;
  const asignadaA = validacion.seguimiento.asignadaA ?? sesion.userId;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    const { data: socia, error: errSocia } = await admin.from('socios')
      .select('id').eq('id', socioId).eq('studio_id', sesion.studioId).is('borrado_en', null).maybeSingle();
    if (errSocia) return errorInterno('seguimientos:socia', errSocia, 'No se ha podido leer la ficha. No se ha creado el seguimiento.');
    if (!socia) return NextResponse.json({ error: 'No se encuentra esta clienta.' }, { status: 404 });

    const puede = await cuentaDelEquipo(admin, sesion.studioId, asignadaA);
    if (puede === null) return errorInterno('seguimientos:equipo', new Error('lectura del equipo'), 'No se ha podido comprobar el equipo. Vuelve a intentarlo.');
    if (!puede) return NextResponse.json({ error: 'Esa persona no está en el equipo, o no gestiona clientas.' }, { status: 400 });

    if (recomendacionId) {
      const { data: rec, error: errRec } = await admin.from('recomendaciones')
        .select('id').eq('id', recomendacionId).eq('studio_id', sesion.studioId).eq('socio_id', socioId).maybeSingle();
      if (errRec) return errorInterno('seguimientos:aviso', errRec, 'No se ha podido comprobar el aviso. Vuelve a intentarlo.');
      if (!rec) return NextResponse.json({ error: 'Ese aviso no es de esta clienta.' }, { status: 400 });
    }

    const id = `tarea-${uid()}`;
    const { error } = await admin.from('tareas').insert({
      id,
      studio_id: sesion.studioId,
      socio_id: socioId,
      titulo,
      estado: 'PENDIENTE',
      origen: 'PANEL',
      vence_el: venceEl,
      asignada_a: asignadaA,
      creada_por: sesion.userId,
      recomendacion_id: recomendacionId,
    });
    if (error) return errorInterno('seguimientos:crear', error, 'No se ha podido crear el seguimiento. Vuelve a intentarlo.');
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return errorInterno('seguimientos', e, 'No se ha podido crear el seguimiento. Vuelve a intentarlo.');
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarCalendario } from '@/lib/permisos-reglas';
import { uid } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// «La he cerrado en ClassPass: liberar 1», en la hoja de la clase. Las plazas
// apartadas para ClassPass no las coge nadie desde Tentare (decisión del
// fundador, 7-oct-2026); si recepción quiere dar una a una clienta, primero la
// cierra en ClassPass y después la libera aquí. Lo hace la base de datos con el
// candado de la sesión (`liberar_plaza_apartada`: baja el cupo de ESA sesión,
// nunca por debajo de lo ya vendido) y queda en Actividad quién lo hizo.
//
// El estudio sale SIEMPRE de la sesión, nunca del body; mismo permiso que
// cambiar el cupo de una sesión (`puede_gestionar_calendario`).
const SESION_ID = /^[A-Za-z0-9_-]{1,140}$/;

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarCalendario(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para cambiar las plazas de esta clase.' }, { status: 403 });
  }

  const cuerpo = await req.json().catch(() => null) as { sesionId?: unknown } | null;
  const sesionId = typeof cuerpo?.sesionId === 'string' && SESION_ID.test(cuerpo.sesionId) ? cuerpo.sesionId : null;
  if (!sesionId) return NextResponse.json({ error: 'Clase no válida' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { data, error } = await admin.rpc('liberar_plaza_apartada', {
    p_studio_id: sesion.studioId, p_sesion_id: sesionId, p_plataforma: 'CLASSPASS',
  });
  if (error) {
    if (error.message.includes('NADA_APARTADO')) {
      return NextResponse.json({ error: 'Ya no queda ninguna plaza apartada para ClassPass en esta clase.' }, { status: 409 });
    }
    if (error.message.includes('SESION_NO_ENCONTRADA')) return NextResponse.json({ error: 'No encontramos esta clase.' }, { status: 404 });
    console.error('[plataformas:liberar-apartada]', error.message);
    return NextResponse.json({ error: 'No se ha podido liberar la plaza. Inténtalo de nuevo.' }, { status: 500 });
  }

  const { error: errLog } = await admin.from('actividad_reciente').insert({
    id: uid(), studio_id: sesion.studioId, tipo: 'PLAZA_PLATAFORMA_LIBERADA',
    texto: 'Liberó una plaza apartada para ClassPass (cerrada allí)',
    socio_id: null, enlace: '/calendario', creado_en: new Date().toISOString(), actor_nombre: sesion.nombre,
  });
  if (errLog) console.error('[plataformas:liberar-apartada] no se pudo registrar la actividad', errLog.message);

  return NextResponse.json({ ok: true, apartadas: typeof data === 'number' ? data : 0 });
}

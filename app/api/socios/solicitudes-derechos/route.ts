import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarClientas } from '@/lib/permisos-reglas';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { mapSolicitudDerechos, validarCierreSolicitud } from '@/lib/socios/solicitudes-derechos';

// Solicitudes de derechos RGPD, lado ESTUDIO (responsable del tratamiento).
//   GET ?socioId=  → las de esa socia + si se ha opuesto al perfilado (ficha).
//   GET            → las PENDIENTES del estudio, por plazo (lista de Clientas).
//   PATCH          → cerrar una: resolver o rechazar (con nota).
//
// Mismo rol que ve la ficha y ejecuta la supresión (`puedeGestionarClientas`,
// espejo de la RLS `puede_gestionar_clientas()` de la tabla). Se escribe con
// service-role, así que la regla de cierre se comprueba aquí en TS
// (`validarCierreSolicitud`) además de en la policy.
//
// «Ejecutar supresión» NO pasa por aquí: la UI llama a `/api/socios/eliminar`
// y solo si responde OK cierra la solicitud — y este PATCH vuelve a comprobar
// en la BD que la socia está de verdad suprimida antes de darla por resuelta.

const COLUMNAS = 'id, socio_id, tipo, estado, solicitada_en, plazo_hasta, resuelta_en, nota';

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para ver las solicitudes de datos personales' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const socioId = req.nextUrl.searchParams.get('socioId');
  if (socioId) {
    const [{ data: socia, error: eSocia }, { data: filas, error: eSol }] = await Promise.all([
      admin.from('socios').select('id, excluir_de_perfilado').eq('id', socioId).eq('studio_id', sesion.studioId).maybeSingle(),
      admin.from('solicitudes_derechos').select(COLUMNAS)
        .eq('studio_id', sesion.studioId).eq('socio_id', socioId).order('solicitada_en', { ascending: false }),
    ]);
    if (eSocia || eSol) return errorInterno('socios/solicitudes-derechos:GET:socia', eSocia ?? eSol);
    if (!socia) return NextResponse.json({ error: 'Socia no encontrada' }, { status: 404 });
    return NextResponse.json({
      excluirDePerfilado: socia.excluir_de_perfilado === true,
      solicitudes: (filas ?? []).map(f => ({ ...mapSolicitudDerechos(f), socia: null })),
    });
  }

  const { data: filas, error } = await admin.from('solicitudes_derechos').select(COLUMNAS)
    .eq('studio_id', sesion.studioId).eq('estado', 'pendiente')
    .order('plazo_hasta', { ascending: true }).limit(200);
  if (error) return errorInterno('socios/solicitudes-derechos:GET', error);
  const ids = [...new Set((filas ?? []).map(f => f.socio_id as string))];
  const { data: socias, error: eSocias } = ids.length
    ? await admin.from('socios').select('id, nombre, apellidos, borrado_en').eq('studio_id', sesion.studioId).in('id', ids)
    : { data: [], error: null };
  if (eSocias) return errorInterno('socios/solicitudes-derechos:GET:socias', eSocias);
  const porId = new Map((socias ?? []).map(s => [s.id as string, s]));
  return NextResponse.json({
    excluirDePerfilado: null,
    solicitudes: (filas ?? []).map(f => {
      const s = porId.get(f.socio_id as string);
      return {
        ...mapSolicitudDerechos(f),
        socia: s ? { nombre: `${s.nombre ?? ''} ${s.apellidos ?? ''}`.trim(), suprimida: !!s.borrado_en } : null,
      };
    }),
  });
}

export async function PATCH(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para gestionar solicitudes de datos personales' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { id?: unknown; accion?: unknown; nota?: unknown } | null;
  if (typeof body?.id !== 'string' || !body.id) return errorPeticion('Falta la solicitud.');

  // El estudio sale de la sesión, nunca del cuerpo.
  const { data: fila, error: eLeer } = await admin.from('solicitudes_derechos').select(COLUMNAS)
    .eq('id', body.id).eq('studio_id', sesion.studioId).maybeSingle();
  if (eLeer) return errorInterno('socios/solicitudes-derechos:PATCH:leer', eLeer);
  if (!fila) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });
  const solicitud = mapSolicitudDerechos(fila);

  const { data: socia, error: eSocia } = await admin.from('socios').select('borrado_en')
    .eq('id', solicitud.socioId).eq('studio_id', sesion.studioId).maybeSingle();
  if (eSocia) return errorInterno('socios/solicitudes-derechos:PATCH:socia', eSocia);

  const cierre = validarCierreSolicitud(body, solicitud, !!socia?.borrado_en);
  if (!cierre.ok) return NextResponse.json({ error: cierre.error }, { status: cierre.status });

  // Compare-and-set sobre `estado = 'pendiente'`: si otra persona la cerró a la
  // vez, no se pisa su decisión.
  const { data: cerrada, error: eCerrar } = await admin.from('solicitudes_derechos')
    .update({ estado: cierre.estado, nota: cierre.nota, resuelta_en: new Date().toISOString(), resuelta_por: sesion.userId })
    .eq('id', solicitud.id).eq('studio_id', sesion.studioId).eq('estado', 'pendiente')
    .select(COLUMNAS).maybeSingle();
  if (eCerrar) return errorInterno('socios/solicitudes-derechos:PATCH:cerrar', eCerrar);
  if (!cerrada) return NextResponse.json({ error: 'Otra persona ya ha cerrado esta solicitud.' }, { status: 409 });
  return NextResponse.json({ solicitud: mapSolicitudDerechos(cerrada) });
}

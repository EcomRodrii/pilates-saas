import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeVer } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { plazasVaciasEncendido } from '@/lib/interruptor-por-estudio';
import { fetchAllRows } from '@/lib/supabase-data';
import { plazasQueDejaronVacias, rangoDePlazasVacias, type ReservaPlazasVacias } from '@/lib/informes/plazas-vacias';
import { errorInterno } from '@/lib/errores-servidor';
import { finDelDiaEstudio, inicioDelDiaEstudio } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// «Plazas que dejaron vacías» en Informes (P3.15). Sin `desde`/`hasta` es la
// sonda (`{ disponible }`); con ellos, por alumna: cuántas clases del periodo
// canceló fuera de plazo o no vino, sobre cuántas tuvo plaza. Solo ids y cifras:
// los nombres los pone el panel. Qué cuenta y por qué no se hace en el navegador,
// en `lib/informes/plazas-vacias.ts`.
//
// ⚠️ Lee con service-role: el estudio sale SIEMPRE de la sesión y el permiso se
// comprueba AQUÍ, antes que el interruptor (`INFORMES_PLAZAS_VACIAS`), para que
// la sonda no le diga a quien no ve Informes si está encendido.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeVer(sesion.rol, '/informes')) return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });
  const encendido = plazasVaciasEncendido(sesion.studioId);

  const params = req.nextUrl.searchParams;
  if (!encendido || (!params.has('desde') && !params.has('hasta'))) {
    return NextResponse.json({ disponible: encendido }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const rango = rangoDePlazasVacias(params.get('desde'), params.get('hasta'));
  if (!rango.ok) return NextResponse.json({ error: rango.error }, { status: 400 });

  const limited = await enforceRateLimit(req, 'informes-plazas-vacias', { max: 30, windowSeconds: 60 }, sesion.studioId);
  if (limited) return limited;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const studioId = sesion.studioId;
  try {
    // Las clases del estudio que EMPEZARON en el periodo (días de Madrid) y no se
    // cancelaron (`cancelada` admite null: null es «no cancelada»). La clase se
    // filtra también por estudio: la reserva y su clase tienen que ser de esta sede.
    const r = await fetchAllRows<ReservaPlazasVacias>(studioId, 'reservas', (from, to) => admin.from('reservas')
      .select('id, socio_id, sesion_id, estado, creado_en, cancelada_tardia, cancelada_motivo, origen, bono_consumo_rastreado, bono_decidido_en, sesiones!inner(inicio, cancelada, studio_id)')
      .eq('studio_id', studioId)
      .eq('sesiones.studio_id', studioId)
      .not('sesiones.cancelada', 'is', true)
      .gte('sesiones.inicio', inicioDelDiaEstudio(rango.desde))
      .lt('sesiones.inicio', finDelDiaEstudio(rango.hasta))
      .order('id').range(from, to));
    // Sin datos completos, NO una lista vacía: «nadie» sería mentira.
    if (r.error) return NextResponse.json({ error: 'No se ha podido calcular.' }, { status: 503 });
    return NextResponse.json(
      { disponible: true, desde: rango.desde, hasta: rango.hasta, filas: plazasQueDejaronVacias(r.data) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return errorInterno('informes/plazas-vacias:GET', err, 'No se ha podido calcular.');
  }
}

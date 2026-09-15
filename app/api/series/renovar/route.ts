import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarCalendario } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import {
  mensajeErrorRenovar, resultadoDeRpc, semanasValidas, seriePorRenovarDeFila, MAX_SEMANAS_RENOVACION,
} from '@/lib/series-renovacion';

export const dynamic = 'force-dynamic';

const ACCIONES = ['simular', 'renovar', 'no_renovar', 'reactivar'] as const;
type Accion = (typeof ACCIONES)[number];

// Renovar una serie (una clase que se repite) desde el panel.
//
// Todo lo decide `renovar_serie` (migr 20260915110000) en una transacción con la
// fila de la serie bloqueada: qué clases crear, cuáles omitir y si alguien la ha
// renovado ya. Esta ruta solo comprueba el rol —el mismo que crear o editar
// clases— y saca el estudio de la sesión, nunca del body: la RPC va con
// service_role y la RLS no la frena.
//
// `renovar` exige `periodoVisto` (el período que tenía la serie cuando se abrió
// la revisión): dos personas renovando a la vez, o un doble clic, reciben
// 'ya_renovada' en vez de dos años de clases.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarCalendario(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para renovar clases' }, { status: 403 });
  }
  // Por estudio y detrás de la sesión: la propietaria y recepción suelen salir
  // por la misma IP, y cada cambio de semanas en el diálogo es una simulación.
  const limited = await enforceRateLimit(req, 'series-renovar', { max: 30, windowSeconds: 60 }, sesion.studioId);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as
    { serieId?: unknown; accion?: unknown; semanas?: unknown; periodoVisto?: unknown } | null;
  const serieId = typeof body?.serieId === 'string' ? body.serieId : '';
  const accion = ACCIONES.find(a => a === body?.accion) as Accion | undefined;
  if (!serieId || !accion) return NextResponse.json({ error: 'Falta la clase o la acción' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    if (accion === 'no_renovar' || accion === 'reactivar') {
      const { data, error } = await admin.from('series')
        .update({ no_renovar: accion === 'no_renovar' })
        .eq('id', serieId).eq('studio_id', sesion.studioId)
        .select('id').maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: mensajeErrorRenovar('SERIE_NO_ENCONTRADA') }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    const semanas = body?.semanas == null ? null : Number(body.semanas);
    if (semanas !== null && !semanasValidas(semanas)) {
      return NextResponse.json({ error: `Elige entre 1 y ${MAX_SEMANAS_RENOVACION} semanas.` }, { status: 400 });
    }
    const periodoVisto = typeof body?.periodoVisto === 'number' && Number.isInteger(body.periodoVisto) ? body.periodoVisto : null;
    if (accion === 'renovar' && periodoVisto === null) {
      return NextResponse.json({ error: 'Revisa la renovación antes de confirmarla' }, { status: 400 });
    }

    const { data, error } = await admin.rpc('renovar_serie', {
      p_studio_id: sesion.studioId, p_serie_id: serieId, p_periodo_visto: periodoVisto,
      p_semanas: semanas, p_actor: sesion.userId, p_origen: 'manual', p_simular: accion === 'simular',
    });
    if (error) {
      const conocido = ['SERIE_NO_ENCONTRADA', 'SERIE_SIN_CLASES', 'SEMANAS_INVALIDAS', 'DEMASIADAS_CLASES'].find(c => error.message.includes(c));
      if (!conocido) throw new Error(error.message);
      return NextResponse.json({ error: mensajeErrorRenovar(conocido) }, { status: conocido === 'SERIE_NO_ENCONTRADA' ? 404 : 400 });
    }
    const resultado = resultadoDeRpc(data);
    if (!resultado) throw new Error('renovar_serie devolvió una forma inesperada');

    // Las plazas fijas del hueco no se copian: se anclan por día, hora y sala, y
    // la clase renovada es la misma. Solo se pasa el motor por ellas para que
    // queden reservadas ya y no a las 2:00. Mejor esfuerzo: el cron las recoge.
    if (resultado.estado === 'renovada') {
      const ids = Array.isArray((data as { plazas_fijas_ids?: unknown }).plazas_fijas_ids)
        ? ((data as { plazas_fijas_ids: unknown[] }).plazas_fijas_ids).filter((x): x is string => typeof x === 'string')
        : [];
      for (const plazaId of ids) {
        const { error: errorMotor } = await admin.rpc('materializar_plazas_fijas', { p_horizonte_dias: 42, p_plaza_id: plazaId });
        if (errorMotor) console.error('[series/renovar] materializar plaza fija', errorMotor.message);
      }
    }

    return NextResponse.json({ ok: true, resultado });
  } catch (err) {
    return errorInterno('series/renovar:POST', err, 'No se ha podido renovar la clase.');
  }
}

// Las clases que se repiten y terminan en los próximos 30 días (o terminaron
// hace menos de 14), para la bandeja de la home. Solo ids: los nombres los pone
// el panel con lo que ya tiene cargado.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarCalendario(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para renovar clases' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    const { data, error } = await admin.rpc('series_por_renovar', { p_studio_id: sesion.studioId, p_dias: 30 });
    if (error) throw new Error(error.message);
    const series = ((data ?? []) as Record<string, unknown>[]).map(seriePorRenovarDeFila);
    return NextResponse.json({ ok: true, series });
  } catch (err) {
    return errorInterno('series/renovar:GET', err, 'No se han podido cargar las clases por renovar.');
  }
}

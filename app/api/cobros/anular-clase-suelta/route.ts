import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { registrarAuditoriaServidor } from '@/lib/auditoria/registrar-servidor';
import { hidratarTiposDePlanes, mapPlanTarifa, mapSuscripcion } from '@/lib/supabase-data';
import { cuotaQueCubreLaClase, puedeAnularSueltaPorCuota, semanaEnEstudio } from '@/lib/reservas/clase-suelta';
import { anularClaseSueltaCubiertaPorCuota } from '@/lib/billing/clase-suelta-mostrador';
import { PREFIJO_RECIBO_DE_CLASE_SUELTA } from '@/lib/cobros/recibo-de-cita';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// «Anular la clase suelta» de la ficha: la clase suelta de una clase que YA cubre
// su cuota. Se le vendió la clase suelta del lunes y el miércoles pasó a cuota,
// que empieza hoy y cubre el lunes: sin esto la clase se cobraba dos veces y el
// estudio tenía que ir borrando cargos a mano.
//
// Todo se vuelve a comprobar aquí con lo que lee el servidor, nunca con lo que
// diga el navegador (`puedeAnularSueltaPorCuota`): que sea la clase suelta de esa
// reserva, pendiente y sin cobro en marcha, la reserva viva, y una cuota ACTIVA
// que cubra el día y el tipo de esa clase. Si ya la pagó no se anula nada:
// devolver el dinero es otra decisión y va por Cobros.
//
// El estudio sale SIEMPRE de la sesión. Escribe con service-role, así que el libro
// de auditoría se anota aquí, con la sesión como actor.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede anular cobros' }, { status: 403 });
  }
  const limitado = await enforceRateLimit(req, 'cobros-anular-clase-suelta', { max: 30, windowSeconds: 60 }, sesion.userId);
  if (limitado) return limitado;

  const cuerpo = await req.json().catch(() => null) as { reciboId?: unknown } | null;
  const reciboId = typeof cuerpo?.reciboId === 'string' ? cuerpo.reciboId : '';
  if (!reciboId.startsWith(PREFIJO_RECIBO_DE_CLASE_SUELTA) || !/^[A-Za-z0-9_-]+$/.test(reciboId)) {
    return NextResponse.json({ error: 'Falta la clase suelta que anular' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const studioId = sesion.studioId;
  const reservaId = reciboId.slice(PREFIJO_RECIBO_DE_CLASE_SUELTA.length);

  const suscripcionSuelta = `sus-suelta-${reservaId}`;
  const [
    { data: recibo, error: errRecibo }, { data: reserva, error: errReserva },
    { data: suelta, error: errSuelta }, { data: facturas, error: errFacturas },
  ] = await Promise.all([
    admin.from('recibos')
      .select('socio_id, suscripcion_id, estado, fecha_cobro, importe, concepto, stripe_payment_intent_id, checkout_session_id, cobro_mostrador_pi, cobro_off_session_clave')
      .eq('id', reciboId).eq('studio_id', studioId).maybeSingle(),
    admin.from('reservas').select('socio_id, sesion_id, estado, bono_suscripcion_id')
      .eq('id', reservaId).eq('studio_id', studioId).maybeSingle(),
    admin.from('suscripciones').select('estado').eq('id', suscripcionSuelta).eq('studio_id', studioId).maybeSingle(),
    admin.from('facturas').select('id').eq('recibo_id', reciboId).eq('studio_id', studioId).limit(1),
  ]);
  if (errRecibo || errReserva || errSuelta || errFacturas) {
    return NextResponse.json({ error: 'No se ha podido comprobar la clase suelta. Inténtalo otra vez.' }, { status: 500 });
  }
  if (!recibo) return NextResponse.json({ error: 'Clase suelta no encontrada' }, { status: 404 });
  const socioId = recibo.socio_id as string;

  const { data: ses, error: errSes } = reserva
    ? await admin.from('sesiones').select('inicio, tipo_clase_id, cancelada')
      .eq('id', reserva.sesion_id as string).eq('studio_id', studioId).maybeSingle()
    : { data: null, error: null };
  if (errSes) return NextResponse.json({ error: 'No se ha podido comprobar la clase. Inténtalo otra vez.' }, { status: 500 });

  // Su tope semanal se cuenta con TODAS sus reservas vivas de esa semana de Madrid
  // (como `calcular_excede_limite_semanal`): las sesiones de esa semana, con un día de
  // margen a cada lado (el corte exacto lo hace `cabeEnElTopeSemanal`), y de ellas las
  // suyas. Dos consultas, porque no hay que fiarse de un embed sin FK declarada; la de
  // reservas en tandas, para que la lista de ids no desborde la URL en un estudio grande.
  const lunes = ses ? Date.parse(`${semanaEnEstudio(ses.inicio as string)}T00:00:00Z`) : 0;
  const { data: sesionesSemana, error: errSemana } = ses
    ? await admin.from('sesiones').select('id, inicio, tipo_clase_id, cancelada').eq('studio_id', studioId)
      .gte('inicio', new Date(lunes - 86_400_000).toISOString()).lt('inicio', new Date(lunes + 8 * 86_400_000).toISOString())
    : { data: [], error: null };
  const idsSemana = (sesionesSemana ?? []).map(x => x.id as string);
  const suyasSemana: { sesion_id: unknown; estado: unknown }[] = [];
  let errSuyas = false;
  for (let i = 0; i < idsSemana.length && !errSuyas; i += 100) {
    const { data, error } = await admin.from('reservas').select('sesion_id, estado')
      .eq('studio_id', studioId).eq('socio_id', socioId).in('sesion_id', idsSemana.slice(i, i + 100));
    if (error) errSuyas = true;
    else suyasSemana.push(...(data ?? []));
  }
  const [{ data: susRows, error: errSus }, { data: planRows, error: errPlanes }] = await Promise.all([
    admin.from('suscripciones').select('*').eq('studio_id', studioId).eq('socio_id', socioId).eq('estado', 'ACTIVA'),
    admin.from('planes_tarifa').select('*').eq('studio_id', studioId),
  ]);
  if (errSemana || errSuyas || errSus || errPlanes) {
    return NextResponse.json({ error: 'No se ha podido comprobar su cuota. Inténtalo otra vez.' }, { status: 500 });
  }
  // Con sus tipos de clase (`plan_tipos_clase`): sin ellos, una cuota solo de Mat parecería cubrir Reformer.
  let planes;
  try {
    planes = await hidratarTiposDePlanes(admin as never, studioId, (planRows ?? []).map(mapPlanTarifa), { estricto: true });
  } catch {
    return NextResponse.json({ error: 'No se ha podido comprobar su cuota. Inténtalo otra vez.' }, { status: 500 });
  }
  const sesionDe = new Map((sesionesSemana ?? []).map(x => [x.id as string, x]));
  const paraTope = suyasSemana.flatMap(r => {
    const x = sesionDe.get(r.sesion_id as string);
    return x ? [{ estado: r.estado as string, inicio: x.inicio as string, tipoClaseId: (x.tipo_clase_id as string | null) ?? null, cancelada: Boolean(x.cancelada) }] : [];
  });
  const cuota = ses
    ? cuotaQueCubreLaClase(socioId, (susRows ?? []).map(mapSuscripcion), planes, ses.inicio as string, (ses.tipo_clase_id as string | null) ?? null, paraTope)
    : null;

  const v = puedeAnularSueltaPorCuota({
    reciboId,
    recibo: recibo as Parameters<typeof puedeAnularSueltaPorCuota>[0]['recibo'],
    suelta: suelta ? { estado: suelta.estado as string } : null,
    reserva: reserva
      ? { socio_id: reserva.socio_id as string, estado: reserva.estado as string, bono_suscripcion_id: (reserva.bono_suscripcion_id as string | null) ?? null }
      : null,
    sesion: ses ? { cancelada: Boolean(ses.cancelada) } : null,
    tieneFactura: (facturas ?? []).length > 0,
    cuota,
  });
  if (!v.ok) return NextResponse.json({ error: v.error, motivo: v.motivo }, { status: 409 });

  const r = await anularClaseSueltaCubiertaPorCuota(admin, {
    studioId, reciboId, suscripcionId: v.suscripcionId, reservaId: v.reservaId, ahoraISO: new Date().toISOString(),
  });
  if (r === 'no-pendiente') {
    return NextResponse.json({ error: 'Esa clase suelta ya no está pendiente: alguien la ha cobrado o ha empezado a cobrarla. Revísala en Cobros.', motivo: 'NO_PENDIENTE' }, { status: 409 });
  }
  if (r === 'fallo') {
    return NextResponse.json({ error: 'No se ha podido anular la clase suelta. Inténtalo otra vez.' }, { status: 500 });
  }

  if (!v.terminar) await registrarAuditoriaServidor(admin, {
    sesion, tabla: 'recibos', filaId: reciboId, operacion: 'UPDATE', socioId,
    antes: { estado: 'PENDIENTE' }, despues: { estado: 'ANULADO' },
    contexto: { accion: 'CLASE_SUELTA_ANULADA_POR_CUOTA', concepto: recibo.concepto, cuota: cuota?.nombre ?? null },
  });
  return NextResponse.json(r === 'anulada'
    ? { ok: true }
    : { ok: true, aviso: 'Recibo anulado y no se le cobra, pero no se ha podido terminar de quitar la clase suelta. Vuelve a pulsar «Anular la clase suelta» para terminarlo.' });
}

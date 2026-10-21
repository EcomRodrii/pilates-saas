import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { hoyEnEstudio } from '@/lib/utils';
import { planificarCambioConDiferencia } from '@/lib/billing/cambio-cuota';
import { registrarAuditoriaServidor } from '@/lib/auditoria/registrar-servidor';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// «Cambiar plan» a una cuota MÁS CARA cobrando la diferencia proporcional.
//
// Dinero real, así que:
//  · Solo roles que mueven dinero (`puedeMoverDinero`), y el estudio sale SIEMPRE
//    de la sesión: cada lectura y la propia función de base de datos filtran por
//    él, así que el id de una cuota de otro estudio es «no encontrada».
//  · El IMPORTE lo calcula el servidor (`planificarCambioConDiferencia` →
//    `diferenciaCambioPlan`). El que manda el navegador solo comprueba que la
//    persona confirmó la cifra que hoy sale; si no coincide, 409 con la nueva.
//  · El cambio (cuota nueva + recibo PENDIENTE + baja de la antigua) lo hace
//    `cambiar_cuota_con_diferencia` en UNA transacción: o pasa todo o no pasa
//    nada, y repetir la petición (doble clic, red que reintenta) no duplica
//    nada: los ids salen de la cuota que se cambia.
//  · Aquí NO se cobra. El recibo queda PENDIENTE y se cobra por los caminos de
//    siempre (tarjeta guardada con su guardia de modo de Stripe, o «marcar
//    cobrado» por `confirmarCobro`). Si ese cobro falla, la deuda ya está a la
//    vista en «Quién me debe» y con la tarjeta entra en el dunning: nunca hay
//    plan nuevo sin su recibo.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede cobrar un cambio de plan' }, { status: 403 });
  }
  const limitado = await enforceRateLimit(req, 'suscripciones-cambiar-con-diferencia', { max: 30, windowSeconds: 60 }, sesion.userId);
  if (limitado) return limitado;

  const cuerpo = await req.json().catch(() => null) as Record<string, unknown> | null;
  const socioId = typeof cuerpo?.socioId === 'string' ? cuerpo.socioId : '';
  const suscripcionActualId = typeof cuerpo?.suscripcionActualId === 'string' ? cuerpo.suscripcionActualId : '';
  const planNuevoId = typeof cuerpo?.planNuevoId === 'string' ? cuerpo.planNuevoId : '';
  const importeConfirmado = typeof cuerpo?.importeConfirmado === 'number' ? cuerpo.importeConfirmado : Number.NaN;
  if (!socioId || !suscripcionActualId || !planNuevoId || !Number.isFinite(importeConfirmado)) {
    return NextResponse.json({ error: 'Petición no válida' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const studioId = sesion.studioId;

  const { data: cuota, error: errCuota } = await admin.from('suscripciones')
    .select('id, socio_id, estado, fecha_fin, plan_id')
    .eq('id', suscripcionActualId).eq('studio_id', studioId).maybeSingle();
  if (errCuota) {
    Sentry.captureException(new Error(`[cambiar-con-diferencia] cuota: ${errCuota.message}`), { tags: { area: 'cobros' } });
    return NextResponse.json({ error: 'No se ha podido leer la cuota. Inténtalo otra vez.' }, { status: 500 });
  }

  const idsPlanes = [planNuevoId, ...(cuota?.plan_id ? [cuota.plan_id as string] : [])];
  const [{ data: planes, error: errPlanes }, { data: sinCobrar, error: errRecibos }] = await Promise.all([
    admin.from('planes_tarifa').select('id, nombre, tipo, precio, activo, periodicidad_meses')
      .eq('studio_id', studioId).in('id', idsPlanes),
    admin.from('recibos').select('id')
      .eq('studio_id', studioId).eq('suscripcion_id', suscripcionActualId)
      .in('estado', ['PENDIENTE', 'EN_CURSO', 'FALLIDO']).limit(1),
  ]);
  if (errPlanes || errRecibos) {
    Sentry.captureException(new Error(`[cambiar-con-diferencia] lectura: ${(errPlanes ?? errRecibos)?.message}`), { tags: { area: 'cobros' } });
    return NextResponse.json({ error: 'No se ha podido comprobar el plan. Inténtalo otra vez.' }, { status: 500 });
  }
  const plan = (id: string | null | undefined) => {
    const p = (planes ?? []).find(x => x.id === id);
    return p ? {
      id: p.id as string, nombre: p.nombre as string, tipo: p.tipo as string, precio: Number(p.precio),
      activo: Boolean(p.activo), periodicidadMeses: (p.periodicidad_meses as number | null) ?? null,
    } : null;
  };

  const hoy = hoyEnEstudio();
  const decision = planificarCambioConDiferencia({
    cuota: cuota ? {
      id: cuota.id as string, socioId: (cuota.socio_id as string | null) ?? null, estado: cuota.estado as string,
      fechaFin: (cuota.fecha_fin as string | null) ?? null, planId: (cuota.plan_id as string | null) ?? null,
    } : null,
    planActual: plan(cuota?.plan_id as string | null),
    planNuevo: plan(planNuevoId),
    socioId,
    recibosSinCobrar: (sinCobrar ?? []).length > 0,
    hoyISO: hoy,
    importeConfirmado,
  });
  // Un reintento de un cambio que YA se hizo: la cuota antigua está CANCELADA y la
  // nueva existe. Se contesta con lo hecho (idempotente), no con un error que
  // haría creer que no pasó.
  if (!decision.ok && decision.codigo === 'CUOTA_NO_ACTIVA') {
    const { data: hecha } = await admin.from('suscripciones').select('id')
      .eq('id', `sus-camb-${suscripcionActualId}`).eq('studio_id', studioId).maybeSingle();
    if (hecha) return NextResponse.json({ ok: true, yaHecho: true, suscripcionId: hecha.id, reciboId: `rec-camb-${suscripcionActualId}` });
  }
  if (!decision.ok) {
    return NextResponse.json(
      { error: decision.error, codigo: decision.codigo, ...(decision.importe !== undefined ? { importe: decision.importe } : {}) },
      { status: decision.status },
    );
  }

  const { data: res, error: errRpc } = await admin.rpc('cambiar_cuota_con_diferencia', {
    p_studio_id: studioId,
    p_socio_id: socioId,
    p_sus_actual_id: suscripcionActualId,
    p_plan_nuevo_id: planNuevoId,
    p_importe: decision.importe,
    p_concepto: decision.concepto,
    p_hoy: hoy,
  });
  if (errRpc) {
    // P0001/P0002: la función dice «no» con una regla (la cuota cambió entre
    // medias). Nada se escribió. Cualquier otro error: tampoco (todo o nada).
    const regla = errRpc.code === 'P0001' || errRpc.code === 'P0002';
    if (!regla) Sentry.captureException(new Error(`[cambiar-con-diferencia] ${errRpc.message}`), { tags: { area: 'cobros' }, extra: { studioId, suscripcionActualId } });
    return NextResponse.json(
      { error: regla ? 'La cuota ha cambiado mientras tanto. Recarga la ficha y vuelve a intentarlo.' : 'No se ha podido cambiar el plan: no se ha tocado nada. Inténtalo otra vez.' },
      { status: regla ? 409 : 500 },
    );
  }
  const hecho = (res ?? {}) as { ya_hecho?: boolean; suscripcion_id?: string; recibo_id?: string };

  // El libro de auditoría: esta ruta escribe con service-role y el trigger no ve
  // quién fue. Solo la primera vez (un reintento no repite el apunte).
  if (!hecho.ya_hecho) {
    await registrarAuditoriaServidor(admin, {
      sesion, tabla: 'suscripciones', filaId: suscripcionActualId, operacion: 'UPDATE', socioId,
      antes: { estado: 'ACTIVA', plan_id: (cuota?.plan_id as string | null) ?? null },
      despues: { estado: 'CANCELADA', plan_id: planNuevoId },
      contexto: {
        accion: 'CUOTA_CAMBIADA_CON_DIFERENCIA', plan_id: planNuevoId, concepto: decision.concepto, importe: decision.importe,
      },
    });
  }
  return NextResponse.json({
    ok: true, yaHecho: Boolean(hecho.ya_hecho),
    suscripcionId: hecho.suscripcion_id, reciboId: hecho.recibo_id, importe: decision.importe,
  });
}

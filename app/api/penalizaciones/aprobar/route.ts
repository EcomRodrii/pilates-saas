import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { bloqueoPorSuscripcion } from '@/lib/billing/billing-guard';
import { cobrarReciboOffSession } from '@/lib/billing/stripe-cobros';
import {
  cuerpoRespuesta, decidirAntesDeCobrar, hayQueReleerRecibo, planificarTrasCobro, resolverEscrituraSinEfecto,
  type Desenlace, type LecturaRecibo,
} from '@/lib/billing/penalizacion-aprobar-reglas';

export const dynamic = 'force-dynamic';

// Fase 3: aprobación manual de un cargo de penalización (cancelación
// tardía/no-show) ya detectado y con recibo creado (estado
// PENDIENTE_APROBACION). Mismo patrón de guardas que
// app/api/stripe/charge-off-session/route.ts, pero actualiza `penalizaciones`
// en vez de `automation_logs` — esa tabla exige un origen real en
// automation_rules/automatizaciones (FK), y ninguna encaja con un cargo de
// dinero (automatizaciones.accion ni siquiera tiene un valor de cobro).
//
// Qué se escribe y qué se contesta lo decide
// `lib/billing/penalizacion-aprobar-reglas.ts` (con su tabla de verdad en el
// .test.ts): aquí solo se lee, se cobra y se ejecuta el plan. Toda escritura es
// compare-and-set sobre el estado — dos aprobaciones a la vez dejaban FALLIDA
// encima de un cobro que había entrado.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede registrar cobros' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { penalizacionId?: string } | null;
  if (!body?.penalizacionId) return NextResponse.json({ error: 'Falta la penalización' }, { status: 400 });

  const bloqueo = await bloqueoPorSuscripcion(sesion.studioId);
  if (bloqueo) return bloqueo;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Service role no configurada' }, { status: 503 });

  const { data: pen } = await admin
    .from('penalizaciones')
    .select('id, studio_id, socio_id, recibo_id, estado')
    .eq('id', body.penalizacionId).eq('studio_id', sesion.studioId).maybeSingle();
  if (!pen) return NextResponse.json({ error: 'Penalización no encontrada' }, { status: 404 });

  const antes = decidirAntesDeCobrar({ estado: pen.estado, reciboId: pen.recibo_id });
  if (antes) return NextResponse.json(cuerpoRespuesta(antes), { status: antes.http });

  // D-5: un fallo TRANSITORIO no escribe nada — la penalización sigue en
  // PENDIENTE_APROBACION y el reintento reutiliza la MISMA Idempotency-Key (el
  // recibo del camino manual nace con `proximo_reintento: null`, así que el
  // dunning no lo recogería si se terminalizara aquí).
  const resultado = await cobrarReciboOffSession({
    reciboId: pen.recibo_id, socioId: pen.socio_id, studioId: sesion.studioId,
  });

  // Antes de dar un cobro por fallido, cómo está el recibo DE VERDAD: si otra
  // petición acaba de cobrarlo, este NO_PENDIENTE es un «ya estaba cobrada».
  let recibo: LecturaRecibo | undefined;
  if (hayQueReleerRecibo(resultado)) {
    const { data, error } = await admin
      .from('recibos').select('estado')
      .eq('id', pen.recibo_id).eq('studio_id', sesion.studioId).maybeSingle();
    recibo = error ? { ok: false } : { ok: true, estado: (data?.estado as string | undefined) ?? null };
  }

  const plan = planificarTrasCobro(resultado, recibo);
  let desenlace: Desenlace = plan.desenlace;

  if (plan.escritura) {
    const { data: tocadas, error: errEscritura } = await admin
      .from('penalizaciones')
      .update({ estado: plan.escritura.estado, procesada_en: new Date().toISOString() })
      .eq('id', pen.id).eq('studio_id', sesion.studioId)
      .in('estado', [...plan.escritura.desde])
      .select('id');
    if (errEscritura || !tocadas?.length) {
      // Alguien la cambió entre medias (o la escritura falló): se relee y se
      // contesta con lo que hay, sin pisarlo.
      const { data: ahora, error: errRelectura } = await admin
        .from('penalizaciones').select('estado')
        .eq('id', pen.id).eq('studio_id', sesion.studioId).maybeSingle();
      const estadoActual = errRelectura ? null : ((ahora?.estado as string | undefined) ?? null);
      desenlace = resolverEscrituraSinEfecto(plan, estadoActual);
      if (plan.escritura.estado === 'COBRADA' && desenlace.http === 202) {
        Sentry.captureMessage('[penalizaciones/aprobar] cobro confirmado pero la penalización no quedó COBRADA', {
          level: 'error', tags: { area: 'cobros', tipo: 'reconciliacion' },
          extra: { penalizacionId: pen.id, reciboId: pen.recibo_id, estadoActual, error: errEscritura?.message },
        });
      }
    }
  }

  if (desenlace.notificar) {
    // Deduplicado por penalización en el motor: dos peticiones que cobran la
    // misma no mandan dos avisos.
    const { emitirPagoPenalizacion } = await import('@/lib/notifications/emit');
    await emitirPagoPenalizacion(admin, {
      studioId: sesion.studioId, socioId: pen.socio_id,
      importe: resultado.importe ?? 0, penalizacionId: pen.id,
    });
  }

  return NextResponse.json(cuerpoRespuesta(desenlace, resultado.status), { status: desenlace.http });
}

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { bloqueoPorSuscripcion } from '@/lib/billing/billing-guard';
import { cobrarReciboOffSession } from '@/lib/billing/stripe-cobros';
import {
  cuerpoRespuesta, decidirAntesDeCobrar, hayQueLeerReciboAntesDeCobrar, hayQueReleerRecibo,
  planSinConsentimiento, planificarTrasCobro, resolverEscrituraSinEfecto,
  type Desenlace, type LecturaRecibo, type Plan,
} from '@/lib/billing/penalizacion-aprobar-reglas';
import { consentimientoCubrePenalizacion } from '@/lib/billing/penalizacion-consentimiento';
import { textoLegalVigenteDeFila } from '@/lib/legal-textos';

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
    .select('id, studio_id, socio_id, reserva_id, recibo_id, estado, importe, tipo, detectada_en')
    .eq('id', body.penalizacionId).eq('studio_id', sesion.studioId).maybeSingle();
  if (!pen) return NextResponse.json({ error: 'Penalización no encontrada' }, { status: 404 });

  const leerRecibo = async (): Promise<LecturaRecibo> => {
    const { data, error } = await admin
      .from('recibos').select('estado')
      .eq('id', pen.recibo_id).eq('studio_id', sesion.studioId).maybeSingle();
    return error ? { ok: false } : { ok: true, estado: (data?.estado as string | undefined) ?? null };
  };

  // Compare-and-set del plan. Si no toca ninguna fila (o la escritura falla),
  // se relee y se contesta con lo que hay, sin pisarlo.
  const ejecutar = async (plan: Plan): Promise<Desenlace> => {
    if (!plan.escritura) return plan.desenlace;
    const { data: tocadas, error: errEscritura } = await admin
      .from('penalizaciones')
      .update({ estado: plan.escritura.estado, procesada_en: new Date().toISOString() })
      .eq('id', pen.id).eq('studio_id', sesion.studioId)
      .in('estado', [...plan.escritura.desde])
      .select('id');
    if (!errEscritura && tocadas?.length) return plan.desenlace;

    const { data: ahora, error: errRelectura } = await admin
      .from('penalizaciones').select('estado')
      .eq('id', pen.id).eq('studio_id', sesion.studioId).maybeSingle();
    const estadoActual = errRelectura ? null : ((ahora?.estado as string | undefined) ?? null);
    const desenlace = resolverEscrituraSinEfecto(plan, estadoActual);
    if (plan.escritura.estado === 'COBRADA' && desenlace.http === 202) {
      Sentry.captureMessage('[penalizaciones/aprobar] cobro confirmado pero la penalización no quedó COBRADA', {
        level: 'error', tags: { area: 'cobros', tipo: 'reconciliacion' },
        extra: { penalizacionId: pen.id, reciboId: pen.recibo_id, estadoActual, error: errEscritura?.message },
      });
    }
    return desenlace;
  };

  // Antes de cobrar: una FALLIDA cuyo recibo ya está COBRADO se corrige sin
  // tocar Stripe; lo demás que no esté pendiente contesta sin cobrar.
  const previo = { estado: pen.estado as string, reciboId: pen.recibo_id as string | null };
  const antes = decidirAntesDeCobrar(previo, hayQueLeerReciboAntesDeCobrar(previo) ? await leerRecibo() : undefined);
  if (antes) {
    const d = await ejecutar(antes);
    return NextResponse.json(cuerpoRespuesta(d), { status: d.http });
  }

  // El contrato que aceptó tiene que recoger ESTE cargo, comprobado ahora y no
  // en la detección: las condiciones pueden haber cambiado mientras esperaba
  // aprobación (`lib/billing/penalizacion-consentimiento.ts`). Si no se puede
  // leer lo necesario, no se cobra y se puede reintentar.
  const { data: reserva, error: errReserva } = await admin
    .from('reservas').select('sesion_id').eq('id', pen.reserva_id).eq('studio_id', sesion.studioId).maybeSingle();
  const { data: clase, error: errClase } = reserva?.sesion_id
    ? await admin.from('sesiones').select('inicio').eq('id', reserva.sesion_id).maybeSingle()
    : { data: null, error: null };
  const { data: studio, error: errStudio } = await admin
    .from('studios')
    .select(`
      nombre, razon_social, nif, direccion, ciudad, codigo_postal, email,
      cancelacion_ventana_horas, penalizacion_importe_eur, politica_privacidad, terminos_servicio
    `)
    .eq('id', sesion.studioId).maybeSingle();
  const { data: socio, error: errSocio } = await admin
    .from('socios').select('aceptacion_version')
    .eq('id', pen.socio_id).eq('studio_id', sesion.studioId).maybeSingle();
  if (errReserva || errClase || errStudio || errSocio || !studio) {
    return NextResponse.json(
      { error: 'No hemos podido comprobar el contrato que aceptó. No se ha cobrado: puedes reintentar.' },
      { status: 503 },
    );
  }
  const veredicto = consentimientoCubrePenalizacion({
    studio: {
      terminosServicio: studio.terminos_servicio,
      penalizacionImporteEur: studio.penalizacion_importe_eur,
      cancelacionVentanaHoras: studio.cancelacion_ventana_horas,
    },
    penalizacion: { tipo: pen.tipo as string, importe: pen.importe, detectadaEn: pen.detectada_en as string | null },
    sesion: clase ? { inicio: clase.inicio as string | null } : null,
    textoAceptado: (socio?.aceptacion_version as string | null | undefined) ?? null,
    textoActual: textoLegalVigenteDeFila(studio),
  });
  if (!veredicto.ok) {
    const d = await ejecutar(planSinConsentimiento(veredicto.motivo));
    // Solo si esta petición la sacó de pendiente; el motor deduplica por penalización igualmente.
    if (d.tipo === 'SIN_CONSENTIMIENTO') {
      const { emitirPenalizacionBloqueada } = await import('@/lib/notifications/emit');
      await emitirPenalizacionBloqueada(admin, {
        studioId: sesion.studioId, socioId: pen.socio_id, motivo: 'consentimiento',
        importe: Number(pen.importe ?? 0), penalizacionId: pen.id,
      });
    }
    return NextResponse.json(cuerpoRespuesta(d), { status: d.http });
  }

  // D-5: un fallo TRANSITORIO no escribe nada — la penalización sigue en
  // PENDIENTE_APROBACION y el reintento reutiliza la MISMA Idempotency-Key (el
  // recibo del camino manual nace con `proximo_reintento: null`, así que el
  // dunning no lo recogería si se terminalizara aquí).
  const resultado = await cobrarReciboOffSession({
    reciboId: pen.recibo_id, socioId: pen.socio_id, studioId: sesion.studioId,
  });

  // Antes de decidir un «no se ha cobrado», cómo está el recibo DE VERDAD: si
  // otra petición acaba de cobrarlo, o si el cargo entró y lo que falló fue lo
  // de después, el recibo ya está COBRADO.
  const recibo = hayQueReleerRecibo(resultado) ? await leerRecibo() : undefined;
  const desenlace = await ejecutar(planificarTrasCobro(resultado, recibo));

  if (desenlace.notificar) {
    // Deduplicado por penalización en el motor (`pago-penalizacion:<id>`): dos
    // peticiones que cobran la misma no mandan dos avisos. El importe sale de
    // la penalización: tras una excepción `resultado.importe` no viene.
    const { emitirPagoPenalizacion } = await import('@/lib/notifications/emit');
    await emitirPagoPenalizacion(admin, {
      studioId: sesion.studioId, socioId: pen.socio_id,
      importe: resultado.importe ?? Number(pen.importe ?? 0), penalizacionId: pen.id,
    });
  }

  return NextResponse.json(cuerpoRespuesta(desenlace, resultado.status), { status: desenlace.http });
}

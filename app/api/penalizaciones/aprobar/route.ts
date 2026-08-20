import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { bloqueoPorSuscripcion } from '@/lib/billing/billing-guard';
import { cobrarReciboOffSession } from '@/lib/billing/stripe-cobros';

export const dynamic = 'force-dynamic';

// Fase 3: aprobación manual de un cargo de penalización (cancelación
// tardía/no-show) ya detectado y con recibo creado (estado
// PENDIENTE_APROBACION). Mismo patrón de guardas que
// app/api/stripe/charge-off-session/route.ts, pero actualiza `penalizaciones`
// en vez de `automation_logs` — esa tabla exige un origen real en
// automation_rules/automatizaciones (FK), y ninguna encaja con un cargo de
// dinero (automatizaciones.accion ni siquiera tiene un valor de cobro).
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
  if (pen.estado !== 'PENDIENTE_APROBACION' || !pen.recibo_id) {
    return NextResponse.json({ error: 'Esta penalización no está pendiente de aprobación' }, { status: 409 });
  }

  const resultado = await cobrarReciboOffSession({
    reciboId: pen.recibo_id, socioId: pen.socio_id, studioId: sesion.studioId,
  });

  if (resultado.ok) {
    // El dinero entró pero el recibo NO quedó marcado (mismo caso que
    // charge-off-session): se responde 202, no 200, y la penalización queda
    // FALLIDA (necesita reconciliación manual) — el cobro en sí NO se
    // reintenta, ya está hecho.
    if (resultado.aviso === 'COBRADO_SIN_PERSISTIR') {
      await admin.from('penalizaciones')
        .update({ estado: 'FALLIDA', procesada_en: new Date().toISOString() })
        .eq('id', pen.id);
      return NextResponse.json({
        ok: true, status: resultado.status, aviso: resultado.aviso,
        error: resultado.error ?? 'Cobro completado en Stripe, pendiente de reconciliación manual.',
      }, { status: 202 });
    }
    await admin.from('penalizaciones')
      .update({ estado: 'COBRADA', procesada_en: new Date().toISOString() })
      .eq('id', pen.id);
    const { emitirPagoPenalizacion } = await import('@/lib/notifications/emit');
    await emitirPagoPenalizacion(admin, {
      studioId: sesion.studioId, socioId: pen.socio_id,
      importe: resultado.importe ?? 0, penalizacionId: pen.id,
    });
    return NextResponse.json({ ok: true, status: resultado.status });
  }

  // D-5: un fallo TRANSITORIO (red/5xx de Stripe, desenlace del cargo
  // desconocido) NO es un veredicto, así que la penalización se queda en
  // PENDIENTE_APROBACION para que el botón pueda pulsarse otra vez — el
  // reintento reutiliza la MISMA Idempotency-Key (el contador del recibo no
  // avanzó) y Stripe deduplica. Marcarla FALLIDA aquí la terminalizaba: el
  // guard de arriba (estado !== 'PENDIENTE_APROBACION' → 409) impedía
  // reintentar, y el recibo del camino manual nace con `proximo_reintento:
  // null` (lib/inngest/penalizaciones.ts), así que el dunning tampoco lo
  // recoge — un timeout de Stripe dejaba la penalización perdida para siempre.
  if (resultado.errorCode === 'ERROR_TRANSITORIO') {
    return NextResponse.json({ error: resultado.error }, { status: 503 });
  }
  await admin.from('penalizaciones')
    .update({ estado: 'FALLIDA', procesada_en: new Date().toISOString() })
    .eq('id', pen.id);
  const status = resultado.errorCode === 'SIN_TARJETA' || resultado.errorCode === 'NO_PENDIENTE' ? 409 : 402;
  return NextResponse.json({ error: resultado.error }, { status });
}

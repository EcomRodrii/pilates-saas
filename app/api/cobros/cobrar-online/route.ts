import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { bloqueoPorSuscripcion } from '@/lib/billing/billing-guard';
import { cobrarReciboOffSession, type CobroErrorCode } from '@/lib/billing/stripe-cobros';
import { bloqueoCobroManualDePenalizacion } from '@/lib/billing/penalizacion-recibo-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

export const dynamic = 'force-dynamic';

// El botón "Cobrar online" de Cobros → Clienta usaba /api/stripe/checkout
// (Checkout Session pública) y redirigía la propia pestaña de quien pulsaba
// —la propietaria— a una página pidiendo una tarjeta a mano. Eso hacía pasar
// a la propietaria como si fuera ella quien paga. Este endpoint es el
// reintento off-session real: cobra con la tarjeta/SEPA YA GUARDADO de la
// socia, sin generar ningún enlace ni requerir acción suya. Mismo patrón que
// app/api/penalizaciones/aprobar (sin automation_logs — cobrarReciboOffSession
// ya deja el recibo escrito, no hace falta un log de automatización para un
// cobro disparado a mano desde Cobros).
const STATUS_POR_ERROR: Record<CobroErrorCode, number> = {
  NO_CONFIGURADO: 503,
  NO_ENCONTRADO: 404,
  NO_PENDIENTE: 409,
  SIN_TARJETA: 409,
  SIN_STRIPE_CONECTADO: 409,
  CUENTA_NO_LISTA: 409,
  FALLO_COBRO: 402,
  // D-5: desenlace desconocido (red/5xx de Stripe) — no es un rechazo de la
  // tarjeta, y reintentar es seguro (misma Idempotency-Key).
  ERROR_TRANSITORIO: 503,
  SUSCRIPCION_PAUSADA: 409,
  MODO_STRIPE_CRUZADO: 503,
  // Política de recibos al cancelar una cuota: el recibo no se puede cobrar así.
  CUOTA_CANCELADA: 409,
  RECIBO_ANULADO: 409,
  SIN_REINTENTOS: 409,
};

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede registrar cobros' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { reciboId?: string; socioId?: string } | null;
  if (!body?.reciboId || !body.socioId) {
    return NextResponse.json({ error: 'Falta el recibo o la socia' }, { status: 400 });
  }

  const bloqueo = await bloqueoPorSuscripcion(sesion.studioId);
  if (bloqueo) return bloqueo;

  // El recibo de una penalización solo con el cobro ya decidido (RECIBO_CREADO).
  // Si no, se cobraba una PENDIENTE_APROBACION saltándose la aprobación y el
  // guardia de consentimiento, o una que se decidió no cobrar.
  const penalizacionNoCobrable = await bloqueoCobroManualDePenalizacion(getSupabaseAdmin(), {
    studioId: sesion.studioId, reciboId: body.reciboId,
  });
  if (penalizacionNoCobrable) {
    return NextResponse.json({ error: penalizacionNoCobrable.mensaje }, { status: penalizacionNoCobrable.http });
  }

  const resultado = await cobrarReciboOffSession({
    reciboId: body.reciboId, socioId: body.socioId, studioId: sesion.studioId,
  });

  if (resultado.ok) {
    if (resultado.aviso === 'COBRADO_SIN_PERSISTIR') {
      return NextResponse.json({
        ok: true, status: resultado.status, aviso: resultado.aviso,
        error: resultado.error ?? 'Cobro completado en Stripe, pendiente de reconciliación manual.',
      }, { status: 202 });
    }
    return NextResponse.json({ ok: true, status: resultado.status });
  }

  const status = resultado.errorCode ? STATUS_POR_ERROR[resultado.errorCode] : 402;
  return NextResponse.json({ error: resultado.error, errorCode: resultado.errorCode }, { status });
}

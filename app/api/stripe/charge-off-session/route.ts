import { NextRequest, NextResponse } from 'next/server';
import { dbUpdateAutomationLog } from '@/lib/supabase-data';
import { verificarSesionStaff } from '@/lib/auth-server';
import { cobrarReciboOffSession, type CobroErrorCode } from '@/lib/stripe-cobros';

// Cobra un recibo pendiente usando la tarjeta ya guardada de la socia, sin
// que ella tenga que hacer nada. Solo se llama cuando alguien del estudio
// aprueba la propuesta de cobro con un toque desde Automatizaciones — nunca
// se dispara en automático sin esa aprobación humana explícita.
// Lógica de cobro en lib/stripe-cobros.ts (compartida con el ejecutor del
// Decision OS, DECISION-OS-ARQUITECTURA.md §12 punto 7).
const STATUS_POR_ERROR: Record<CobroErrorCode, number> = {
  NO_CONFIGURADO: 503,
  NO_ENCONTRADO: 404,
  NO_PENDIENTE: 409,
  SIN_TARJETA: 409,
  SIN_STRIPE_CONECTADO: 409,
  FALLO_COBRO: 402,
};

export async function POST(req: NextRequest) {
  // SEGURIDAD: solo staff autenticado, y solo puede cobrar recibos de SU estudio.
  // Sin esto, cualquiera podía cargar una tarjeta guardada pasando IDs.
  const sesion = await verificarSesionStaff(req);
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = await req.json() as { logId: string; reciboId: string; socioId: string; studioId: string };

  if (body.studioId !== sesion.studioId) {
    return NextResponse.json({ error: 'No autorizado para este estudio' }, { status: 403 });
  }

  const resultado = await cobrarReciboOffSession({
    reciboId: body.reciboId,
    socioId: body.socioId,
    studioId: body.studioId,
    // El logId ya era el identificador natural de este flujo — ahora también
    // sirve de Idempotency-Key: un reintento nunca duplica el cargo en Stripe.
    idempotencyKey: body.logId,
  });

  if (resultado.ok) {
    await dbUpdateAutomationLog(body.logId, {
      resultado: 'EJECUTADO',
      detalle: `Cobro de ${resultado.importe}€ aprobado y cobrado con la tarjeta guardada.`,
    });
    return NextResponse.json({ ok: true, status: resultado.status });
  }

  await dbUpdateAutomationLog(body.logId, { resultado: 'FALLIDO', detalle: resultado.error ?? 'Error desconocido al cobrar' });
  const status = resultado.errorCode ? STATUS_POR_ERROR[resultado.errorCode] : 402;
  return NextResponse.json({ error: resultado.error }, { status });
}

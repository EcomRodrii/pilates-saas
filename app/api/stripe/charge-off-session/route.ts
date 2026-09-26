import { NextRequest, NextResponse } from 'next/server';
import { dbUpdateAutomationLog } from '@/lib/db/supabase-data-admin';
import { verificarSesionStaff } from '@/lib/auth-server';
import { bloqueoPorSuscripcion } from '@/lib/billing/billing-guard';
import { capturar } from '@/lib/analytics';
import { cobrarReciboOffSession, type CobroErrorCode } from '@/lib/billing/stripe-cobros';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { bloqueoCobroManualDePenalizacion } from '@/lib/billing/penalizacion-recibo-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { anotarCobroManual, leerReciboAntesDeCobrar } from '@/lib/auditoria/cobro-manual';

// Cobra un recibo pendiente usando la tarjeta ya guardada de la socia, sin
// que ella tenga que hacer nada. Solo se llama cuando alguien del estudio
// aprueba la propuesta de cobro con un toque desde Automatizaciones — nunca
// se dispara en automático sin esa aprobación humana explícita.
// Lógica de cobro en lib/billing/stripe-cobros.ts (compartida con el ejecutor del
// Decision OS, DECISION-OS-ARQUITECTURA.md §12 punto 7).
const STATUS_POR_ERROR: Record<CobroErrorCode, number> = {
  NO_CONFIGURADO: 503,
  NO_ENCONTRADO: 404,
  NO_PENDIENTE: 409,
  SIN_TARJETA: 409,
  SIN_STRIPE_CONECTADO: 409,
  CUENTA_NO_LISTA: 409,
  FALLO_COBRO: 402,
  // D-5: desenlace desconocido (red caída, 5xx de Stripe) — NO es un rechazo
  // de la tarjeta. Reintentar es seguro: la Idempotency-Key no cambió, así que
  // Stripe deduplica. 503 y no 402 para que no se lea como "la socia no pagó".
  ERROR_TRANSITORIO: 503,
  SUSCRIPCION_PAUSADA: 409,
  // Mal configurado el entorno, no culpa de quien pulsa: 503, como el resto de
  // "esto no está listo para cobrar" (ver lib/billing/modo-stripe.ts).
  MODO_STRIPE_CRUZADO: 503,
  // Política de recibos al cancelar una cuota: el recibo no se puede cobrar así.
  CUOTA_CANCELADA: 409,
  RECIBO_ANULADO: 409,
  SIN_REINTENTOS: 409,
};

export async function POST(req: NextRequest) {
  // SEGURIDAD: solo staff autenticado, y solo puede cobrar recibos de SU estudio.
  // Sin esto, cualquiera podía cargar una tarjeta guardada pasando IDs.
  const sesion = await verificarSesionStaff(req);
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  // S-2: la ruta usa service-role (se salta la RLS), así que el rol se
  // comprueba aquí. Vía `puedeMoverDinero` y NO con una lista negra escrita a
  // mano: `rol === 'INSTRUCTOR'` dejaba pasar al MANAGER, que podía cobrar un
  // recibo off-session igual que ya se corrigió en terminal/cobrar y
  // facturas/sellar (auditoría 2026-07-29, I-6).
  if (!puedeMoverDinero(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede registrar cobros' }, { status: 403 });
  }

  const body = await req.json() as { logId: string; reciboId: string; socioId: string; studioId: string };

  if (body.studioId !== sesion.studioId) {
    return NextResponse.json({ error: 'No autorizado para este estudio' }, { status: 403 });
  }

  // R7: un estudio con la suscripción caducada no puede cobrar a sus socias.
  const bloqueo = await bloqueoPorSuscripcion(sesion.studioId);
  if (bloqueo) return bloqueo;

  // El recibo de una penalización solo con el cobro ya decidido (RECIBO_CREADO),
  // igual que en «Cobrar online». La propuesta queda cerrada con el porqué.
  const admin = getSupabaseAdmin();
  const penalizacionNoCobrable = await bloqueoCobroManualDePenalizacion(admin, {
    studioId: sesion.studioId, reciboId: body.reciboId,
  });
  if (penalizacionNoCobrable) {
    await dbUpdateAutomationLog(body.logId, sesion.studioId, { resultado: 'FALLIDO', detalle: penalizacionNoCobrable.mensaje });
    return NextResponse.json({ error: penalizacionNoCobrable.mensaje }, { status: penalizacionNoCobrable.http });
  }

  // Libro de auditoría: quién aprueba el cobro. Esta ruta usa service-role, así que el trigger no lo ve; el
  // actor es la SESIÓN. Se lee el recibo antes y después y se anota lo que cambió. Nunca lanza ni retrasa
  // el cargo más de unos segundos.
  const antes = admin ? await leerReciboAntesDeCobrar(admin, sesion.studioId, body.reciboId) : null;
  const anotarCobro = (resultado: Awaited<ReturnType<typeof cobrarReciboOffSession>>) =>
    admin
      ? anotarCobroManual(admin, {
          sesion, reciboId: body.reciboId, socioId: body.socioId, antes, resultado, origen: 'AUTOMATIZACIONES',
        })
      : Promise.resolve();

  // A-10: la Idempotency-Key la deriva cobrarReciboOffSession del reciboId, para
  // que este disparador (aprobación manual) y el ejecutor del Decision OS
  // converjan en la misma clave y Stripe deduplique el cobro del mismo recibo.
  const resultado = await cobrarReciboOffSession({
    reciboId: body.reciboId,
    socioId: body.socioId,
    studioId: body.studioId,
  });

  if (resultado.ok) {
    // El dinero entró pero el recibo NO quedó marcado: se registra como FALLIDO
    // (necesita intervención) y se responde 202, no 200, para que el llamante no
    // lo dé por cerrado. El cobro en sí no se reintenta: ya está hecho.
    if (resultado.aviso === 'COBRADO_SIN_PERSISTIR') {
      const detalle = resultado.error ?? 'Cobro completado en Stripe, pero pendiente de reconciliación manual.';
      await dbUpdateAutomationLog(body.logId, sesion.studioId, { resultado: 'FALLIDO', detalle });
      capturar(body.studioId, { nombre: 'pago_completado', props: { importe_centimos: Math.round((resultado.importe ?? 0) * 100), via: 'off_session' } });
      // Después del log: con el dinero ya cobrado, nada puede retrasar que la automatización quede marcada.
      await anotarCobro(resultado);
      return NextResponse.json({ ok: true, status: resultado.status, aviso: resultado.aviso, error: detalle }, { status: 202 });
    }
    await dbUpdateAutomationLog(body.logId, sesion.studioId, {
      resultado: 'EJECUTADO',
      detalle: `Cobro de ${resultado.importe}€ aprobado y cobrado con la tarjeta guardada.`,
    });
    // R4: señal de GMV (cobro con tarjeta guardada).
    capturar(body.studioId, { nombre: 'pago_completado', props: { importe_centimos: Math.round((resultado.importe ?? 0) * 100), via: 'off_session' } });
    await anotarCobro(resultado);
    return NextResponse.json({ ok: true, status: resultado.status });
  }

  await dbUpdateAutomationLog(body.logId, sesion.studioId, { resultado: 'FALLIDO', detalle: resultado.error ?? 'Error desconocido al cobrar' });
  const status = resultado.errorCode ? STATUS_POR_ERROR[resultado.errorCode] : 402;
  return NextResponse.json({ error: resultado.error }, { status });
}

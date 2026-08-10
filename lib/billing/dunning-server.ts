import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { planificarTrasFallo, debeAutoCancelarSuscripcion, type PlanReintento } from './dunning.ts';
import { enviarEmailImpago } from '../emails/impago-server.ts';
import { aplicarRenovacionServidor } from './renovacion-server.ts';
import { sellarFacturaDeRecibo } from './sellar-factura-server.ts';

// Registra un intento de cobro FALLIDO de un recibo y avanza su ciclo de dunning:
// cuenta el intento, reprograma el siguiente reintento (+3 / +7 días) o marca el
// recibo FALLIDO tras el tercero, y notifica — a la socia solo en el 1.er fallo y
// en el fallo definitivo, al estudio (in-app) solo en el fallo definitivo.
//
// Lo usan el webhook de Stripe (devolución de un adeudo SEPA) y el barrido diario
// de dunning (rechazo síncrono de tarjeta), para que ambos métodos sigan el mismo
// flujo. La actualización del recibo es la parte crítica (lanza si falla); los
// avisos son best-effort (no rompen el flujo de cobro).
// `studioId` es obligatorio a propósito: `admin` es service-role y bypassa RLS,
// así que sin acotar por tenant un reciboId de otro estudio avanzaría su ciclo de
// dunning (y le mandaría avisos a sus socias). Debe venir de una fuente fiable —
// en el webhook, de la cuenta Connect que firma el evento, no de la metadata.
export async function registrarFalloCobro(params: {
  admin: SupabaseClient;
  reciboId: string;
  studioId: string;
  esSepa: boolean;
  ahoraISO: string;
}): Promise<{ estado: 'PENDIENTE' | 'FALLIDO'; intentos: number } | null> {
  const { admin, reciboId, studioId, esSepa } = params;

  const { data: rec } = await admin
    .from('recibos')
    .select('id, studio_id, socio_id, suscripcion_id, concepto, importe, fecha_vencimiento, intentos_reintento')
    .eq('id', reciboId)
    .eq('studio_id', studioId)
    .maybeSingle();
  if (!rec) return null;

  const plan = planificarTrasFallo(rec.intentos_reintento ?? 0, rec.fecha_vencimiento);

  const { error } = await admin
    .from('recibos')
    .update({
      estado: plan.estado,
      intentos_reintento: plan.intentos,
      proximo_reintento: plan.proximoReintento,
      ...(esSepa ? { sepa_estado: 'failed' } : {}),
    })
    .eq('id', reciboId)
    .eq('studio_id', studioId);
  if (error) throw new Error(error.message);

  // Hallazgo A (auditoría dunning 2026-08-10): al agotar los 3 reintentos la
  // suscripción se quedaba ACTIVA para siempre con `fecha_fin` ya vencida —
  // la reserva de plaza está a salvo (tieneEntitlementActivo/calcularEstadoSuscripcion
  // sí miran fecha_fin), pero los contadores que solo filtran por
  // `estado === 'ACTIVA'` (MRR, "bonos activos"...) se inflaban con el tiempo.
  // Mismo valor de enum que ya usa el resto del repo para "esta suscripción ya
  // no está vigente y no se debe reintentar/renovar" — el botón "Cancelar
  // suscripción" de la ficha de clienta (studio-context.tsx) escribe el mismo
  // 'CANCELADA', así que este camino automático queda con el mismo estado (y
  // habilita el mismo botón "Reactivar" que el manual).
  //
  // Best-effort (no tira el registro del fallo, ya guardado arriba) pero
  // idempotente de verdad: el UPDATE va condicionado a `estado = 'ACTIVA'`,
  // así que un reintento del webhook/cron sobre un recibo ya FALLIDO es un
  // no-op silencioso, nunca un segundo efecto ni un error.
  if (debeAutoCancelarSuscripcion(plan, rec.suscripcion_id)) {
    try {
      await admin
        .from('suscripciones')
        .update({ estado: 'CANCELADA' })
        .eq('id', rec.suscripcion_id)
        .eq('studio_id', studioId)
        .eq('estado', 'ACTIVA');
    } catch (e) {
      Sentry.captureException(e instanceof Error ? e : new Error('Fallo al auto-cancelar suscripción tras impago definitivo'), {
        level: 'error', tags: { area: 'cobros', tipo: 'dunning' }, extra: { reciboId, suscripcionId: rec.suscripcion_id },
      });
    }
  }

  if (plan.esPrimerFallo || plan.esDefinitivo) {
    // Best-effort: un fallo notificando no debe tirar el registro del fallo de cobro.
    try {
      await notificarFalloCobro({ admin, rec, plan });
      // Notification Engine: solo al quedar FALLIDO (requiere acción manual) se
      // avisa a la propietaria + socia in-app/push. El email a la socia (1.er
      // fallo informativo o definitivo) lo sigue enviando notificarFalloCobro.
      // Mismo evento sirve para avisar de la cancelación por impago: el texto
      // ("revisa tu método de pago") ya es genérico, no hace falta uno nuevo.
      if (plan.esDefinitivo) {
        const { emitirPagoFallido } = await import('../notifications/emit.ts');
        await emitirPagoFallido(admin, { studioId, reciboId });
      }
    } catch (e) {
      Sentry.captureException(e instanceof Error ? e : new Error('Fallo al notificar impago'), {
        level: 'warning', tags: { area: 'cobros', tipo: 'dunning' }, extra: { reciboId },
      });
    }
  }

  return { estado: plan.estado, intentos: plan.intentos };
}

// Confirma un cobro SEPA que Stripe ya liquidó (`payment_intent.succeeded`):
// marca el recibo COBRADO, renueva la suscripción y sella la factura del
// ciclo. La usan el webhook (`payment_intent.succeeded`) y el reconciliador
// de `lib/inngest/dunning.ts` (backstop cuando el webhook nunca llegó) — misma
// función, para que las dos vías no diverjan. `studioId` viene siempre de una
// fuente fiable del llamante (la cuenta Connect del evento, o el propio
// recibo ya scopeado por estudio), nunca de la metadata del PaymentIntent.
export async function confirmarCobroSepaExitoso(params: {
  admin: SupabaseClient;
  reciboId: string;
  studioId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { admin, reciboId, studioId } = params;
  const { data: rec, error: updErr } = await admin.from('recibos')
    .update({ estado: 'COBRADO', fecha_cobro: new Date().toISOString(), metodo_cobro: 'SEPA', sepa_estado: 'succeeded' })
    .eq('id', reciboId).eq('studio_id', studioId).select('id').maybeSingle();
  if (updErr) return { ok: false, error: updErr.message };
  if (!rec) return { ok: false, error: 'Recibo no encontrado' };

  await aplicarRenovacionServidor(admin, { studioId, reciboId });
  const { emitirPagoRealizado } = await import('../notifications/emit.ts');
  await emitirPagoRealizado(admin, { studioId, reciboId });
  const { enviarEmailReciboWebhook } = await import('../emails/enviar-recibo-webhook.ts');
  await enviarEmailReciboWebhook(admin, { studioId, reciboId });
  try {
    const sell = await sellarFacturaDeRecibo(admin, { studioId, reciboId, facturaId: `fac-sepa-${reciboId}` });
    if (!sell.ok) throw new Error(sell.error ?? 'sellado falló');
  } catch (e) {
    Sentry.captureException(e instanceof Error ? e : new Error('Fallo al sellar la factura del cobro SEPA'), {
      level: 'warning', tags: { area: 'facturacion', tipo: 'sepa_ciclo' }, extra: { reciboId },
    });
  }
  return { ok: true };
}

async function notificarFalloCobro(params: {
  admin: SupabaseClient;
  rec: { id: string; studio_id: string; socio_id: string | null; concepto: string; importe: number };
  plan: PlanReintento;
}) {
  const { admin, rec, plan } = params;

  const socio = rec.socio_id
    ? (await admin.from('socios').select('nombre, email').eq('id', rec.socio_id).maybeSingle()).data as { nombre: string | null; email: string | null } | null
    : null;
  const estudio = (await admin.from('studios').select('nombre').eq('id', rec.studio_id).maybeSingle()).data as { nombre: string | null } | null;
  const estudioNombre = estudio?.nombre ?? undefined;

  // Email a la socia (1.er fallo informativo o fallo definitivo).
  if (socio?.email) {
    await enviarEmailImpago({
      to: socio.email,
      toName: socio.nombre ?? 'socia',
      estudioNombre,
      studioId: rec.studio_id,
      concepto: rec.concepto,
      importe: rec.importe,
      definitivo: plan.esDefinitivo,
    });
  }

  // El aviso in-app a la dueña al quedar FALLIDO lo emite ahora el Notification
  // Engine (evento pago.fallido, ver registrarFalloCobro) — ya no se escribe a la
  // tabla legacy `notificaciones`.
}

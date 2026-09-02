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

// Confirma un cobro que Stripe ya liquidó (`payment_intent.succeeded`): marca
// el recibo COBRADO, renueva la suscripción y sella la factura del ciclo.
//
// Nació para SEPA (adeudo asíncrono: el webhook ES el camino normal) y la usan
// el webhook y el reconciliador de `lib/inngest/dunning.ts` (backstop cuando
// el webhook nunca llegó) — misma función, para que las vías no diverjan.
//
// D-6 (auditoría 20-ago): también TARJETA. El cobro con tarjeta guardada es
// síncrono (`cobrarReciboOffSession` persiste al confirmar), así que aquí el
// webhook no es el camino normal sino la RED: recoge el COBRADO_SIN_PERSISTIR
// (cargo OK en Stripe, UPDATE del recibo fallido) y el caso D-5 de respuesta
// perdida cuando la clave de idempotencia ya expiró (>24 h). Es la pieza que
// cierra de verdad la ventana que documenta lib/billing/clasificar-error-cobro.ts.
//
// `studioId` viene siempre de una fuente fiable del llamante (la cuenta
// Connect del evento, o el propio recibo ya scopeado por estudio), nunca de la
// metadata del PaymentIntent.
export async function confirmarCobroExitoso(params: {
  admin: SupabaseClient;
  reciboId: string;
  studioId: string;
  metodo: 'SEPA' | 'TARJETA';
  /** El cargo real, para poder devolverlo desde el panel. Solo se escribe si viene. */
  paymentIntentId?: string | null;
  /** F-12/F-13: quién lo confirma, para `recibos.conciliado_por`. */
  fuente: 'webhook' | 'conciliador';
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { admin, reciboId, studioId, metodo, fuente } = params;
  const esSepa = metodo === 'SEPA';
  const ahoraISO = new Date().toISOString();
  const { data: rec, error: updErr } = await admin.from('recibos')
    .update({
      estado: 'COBRADO', fecha_cobro: ahoraISO, metodo_cobro: metodo,
      ...(esSepa ? { sepa_estado: 'succeeded' } : {}),
      ...(params.paymentIntentId ? { stripe_payment_intent_id: params.paymentIntentId } : {}),
      conciliado_en: ahoraISO, conciliado_por: fuente,
    })
    // Mismo guardia de estados que el camino de checkout (webhook/route.ts) y
    // el conciliador: quedan fuera COBRADO —para no reescribir fecha_cobro con
    // un evento tardío o reentregado— y sobre todo DEVUELTO, para no RESUCITAR
    // un recibo ya devuelto. Un adeudo SEPA se puede devolver hasta 8 semanas
    // después, así que la secuencia succeeded → refunded → reentrega del
    // succeeded original es perfectamente posible; sin este `.in(...)` volvía a
    // COBRADO con fecha_devolucion puesta Y re-ejecutaba renovación,
    // notificación y email de recibo.
    .eq('id', reciboId).eq('studio_id', studioId)
    .in('estado', ['PENDIENTE', 'FALLIDO', 'EN_CURSO'])
    .select('id').maybeSingle();
  if (updErr) return { ok: false, error: updErr.message };
  // 0 filas tiene ahora DOS causas y hay que distinguirlas, porque el llamador
  // (webhook: 'Recibo no encontrado') usa una de ellas para detectar un cobro
  // que apunta a un recibo de OTRO estudio. Sin esta segunda consulta, ese
  // aviso cross-tenant se volvía inalcanzable y el caso pasaba en silencio.
  // Mismo criterio que el gemelo de checkout en webhook/route.ts.
  if (!rec) {
    const { data: existe } = await admin.from('recibos')
      .select('id, estado').eq('id', reciboId).eq('studio_id', studioId).maybeSingle();
    // No existe (o es de otro estudio): sigue siendo un error para el llamador,
    // que lo usa para detectar un cobro que apunta a otro tenant.
    if (!existe) return { ok: false, error: 'Recibo no encontrado' };
    // DEVUELTO es el caso que motivó el guardia: NO se resucita ni se repiten
    // sus efectos. Un adeudo SEPA se puede devolver hasta 8 semanas después,
    // así que succeeded → refunded → reentrega del succeeded es real.
    if (existe.estado === 'DEVUELTO') return { ok: true };
    // Ya COBRADO, vía TARJETA: es el caso NORMAL, no una reentrega rara — el
    // webhook llega para cada cargo y `cobrarReciboOffSession` ya lo persistió
    // todo de forma síncrona. Se repara en silencio lo idempotente (renovación
    // y sellado, la única red si el proceso murió entre el UPDATE y la
    // renovación) pero SIN notificación ni email: el camino síncrono de
    // tarjeta nunca los ha enviado, y mandarlos aquí estrenaría un email por
    // cada cobro normal — un cambio de producto disfrazado de reconciliación.
    if (!esSepa) {
      await aplicarRenovacionServidor(admin, { studioId, reciboId });
      try {
        const sell = await sellarFacturaDeRecibo(admin, { studioId, reciboId, facturaId: `fac-off-${reciboId}` });
        // Solo consola, sin Sentry: en esta rama el sellado ya lo intentó (y
        // reportó, si falló) la vía síncrona segundos antes — capturarlo aquí
        // también duplicaría el aviso en CADA cobro de un estudio sin NIF.
        if (!sell.ok) console.error('[confirmarCobroExitoso] reparación: factura sin sellar', reciboId, sell.error);
      } catch (e) {
        console.error('[confirmarCobroExitoso] reparación: fallo al sellar', reciboId, e);
      }
      return { ok: true };
    }
    // Ya COBRADO, vía SEPA: es una reentrega del evento. Se deja caer al bloque
    // de abajo igual que hace el gemelo de checkout, porque esos pasos son
    // idempotentes y son la ÚNICA red si el proceso murió entre el UPDATE y la
    // renovación (el conciliador no lo repara: solo mira recibos EN_CURSO).
  }

  // Transición real (o reentrega SEPA): efectos completos. En TARJETA llegar
  // aquí significa que el webhook acaba de RECUPERAR un cobro que el camino
  // síncrono perdió — avisar a la socia es lo correcto: nadie más lo hará.
  await aplicarRenovacionServidor(admin, { studioId, reciboId });
  const { emitirPagoRealizado } = await import('../notifications/emit.ts');
  await emitirPagoRealizado(admin, { studioId, reciboId });
  const { enviarEmailReciboWebhook } = await import('../emails/enviar-recibo-webhook.ts');
  await enviarEmailReciboWebhook(admin, { studioId, reciboId });
  try {
    // TARJETA usa el MISMO id de factura que `cobrarReciboOffSession`
    // (`fac-off-…`): si el camino síncrono ya selló, esto colisiona y no
    // duplica (el sellado además dedupea por recibo_id, cinturón y tirantes).
    const sell = await sellarFacturaDeRecibo(admin, {
      studioId, reciboId, facturaId: esSepa ? `fac-sepa-${reciboId}` : `fac-off-${reciboId}`,
    });
    if (!sell.ok) throw new Error(sell.error ?? 'sellado falló');
  } catch (e) {
    Sentry.captureException(e instanceof Error ? e : new Error('Fallo al sellar la factura del cobro'), {
      level: 'warning', tags: { area: 'facturacion', tipo: esSepa ? 'sepa_ciclo' : 'tarjeta_recibo' }, extra: { reciboId },
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

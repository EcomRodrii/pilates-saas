import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { planificarTrasFallo, debeAutoCancelarSuscripcion, type PlanReintento } from './dunning.ts';
import { enviarEmailImpago } from '../emails/impago-server.ts';
import { penalizacionDelRecibo } from './penalizacion-aprobar-reglas.ts';
import { seguirCreditosAlRecibo } from './creditos-recibo-server.ts';
import { confirmarCobro, aplicarEfectosCobro } from './confirmar-cobro.ts';
import { facturaIdMetodoGuardado } from './cobro-confirmado-reglas.ts';

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

  const { data: actualizado, error } = await admin
    .from('recibos')
    .update({
      estado: plan.estado,
      intentos_reintento: plan.intentos,
      proximo_reintento: plan.proximoReintento,
      ...(esSepa ? { sepa_estado: 'failed' } : {}),
    })
    .eq('id', reciboId)
    .eq('studio_id', studioId)
    // Mismo guardia de estados que sus dos hermanas (`confirmarCobroExitoso`
    // más abajo y `procesarChargeRefunded` en procesar-reembolso.ts): solo se
    // avanza el ciclo de dunning sobre un recibo REINTENTABLE. Sin esto, un
    // `charge.failed`/`payment_intent.payment_failed` tardío —o el reenvío de
    // un evento viejo— RESUCITABA a PENDIENTE un recibo ya COBRADO o ya
    // DEVUELTO, y encima le mandaba a la socia el email de impago de un cobro
    // que sí se hizo. Un adeudo SEPA puede fallar semanas después del
    // succeeded original, así que la secuencia es real, no teórica.
    // COBRADO solo se admite en SEPA: un adeudo se marca COBRADO al liquidar y
    // el banco puede devolverlo SEMANAS despues (R-transaction), asi que ahi el
    // fallo tardio es REAL y hay que procesarlo — excluirlo dejaba el recibo
    // COBRADO con dinero que nunca entro. Con tarjeta no existe ese caso: tras
    // un succeeded no llega un failed del mismo PaymentIntent, asi que solo
    // puede ser el reenvio de un evento viejo. DEVUELTO nunca se resucita.
    .in('estado', esSepa
      ? ['PENDIENTE', 'FALLIDO', 'EN_CURSO', 'COBRADO']
      : ['PENDIENTE', 'FALLIDO', 'EN_CURSO'])
    .select('id');
  if (error) throw new Error(error.message);
  // 0 filas = el recibo existe (se leyó arriba) pero su estado ya no admite
  // reintento. No es un error, pero tampoco es normal: se reporta para poder
  // distinguir el reenvío inocente de un evento de un fallo de cobro real que
  // se está perdiendo.
  if (!actualizado || actualizado.length === 0) {
    Sentry.captureMessage('[dunning] fallo de cobro ignorado: el recibo ya no es reintentable', {
      level: 'warning', tags: { area: 'cobros', tipo: 'dunning' },
      extra: {
        reciboId, studioId, esSepa,
        queHacer: 'El recibo está COBRADO o DEVUELTO: no se avanza su ciclo de dunning ni se avisa a la socia. Revisar si el fallo era real y llegó tarde.',
      },
    });
    return null;
  }

  // Si el recibo es el de una penalización, la penalización refleja el fallo ya
  // (`escrituraPorEstadoDelRecibo`): un adeudo SEPA dado por cobrado en
  // `processing` que ahora falla deja de contar como COBRADA —la liquidación de
  // la instructora la imputaba sin el dinero— y pasa a RECIBO_CREADO si vuelve al
  // dunning, o a FALLIDA si se agotó. Cubre las tres llamadas (webhook, dunning y
  // su red SEPA). Nunca lanza; lo que no escriba lo recoge el barrido horario del
  // cron de penalizaciones. Import dinámico y solo para estos recibos: ese módulo
  // usa alias `@/`, que `node --test` no resuelve.
  if (penalizacionDelRecibo(reciboId)) {
    try {
      const { seguirPenalizacionAlRecibo } = await import('./penalizacion-recibo-server.ts');
      await seguirPenalizacionAlRecibo(admin, { studioId, reciboId });
    } catch (e) {
      Sentry.captureException(e instanceof Error ? e : new Error('No se pudo reflejar el fallo de cobro en la penalización'), {
        level: 'error', tags: { area: 'cobros', tipo: 'penalizacion-recibo' }, extra: { reciboId, studioId },
      });
    }
  }

  // Un adeudo SEPA dado por COBRADO que el banco devuelve después: el dinero no
  // está, así que los créditos de «Renovar plan» que dio se revierten (lo
  // gastado queda por compensar). Solo SEPA puede venir de COBRADO; con tarjeta
  // el recibo nunca estuvo cobrado y no hay nada que revertir. Nunca lanza.
  if (esSepa) {
    await seguirCreditosAlRecibo(admin, { studioId, reciboId });
  }

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
    // Sin cuota: si el estudio eligió «Liberar sus clases», fuera las de su plaza
    // fija ya (con las otras políticas la BD no lista ninguna). El cron nocturno
    // también lo haría, pero puede haber una clase mañana. Best-effort.
    try {
      if (rec.socio_id) {
        const { soltarReservasPlazaFijaSinCuota } = await import('@/lib/db/supabase-data-admin');
        await soltarReservasPlazaFijaSinCuota(admin, { studioId, socioId: rec.socio_id });
      }
    } catch (e) {
      Sentry.captureException(e instanceof Error ? e : new Error('Fallo al soltar plazas fijas tras impago definitivo'), {
        level: 'warning', tags: { area: 'plazas-fijas', tipo: 'dunning' }, extra: { reciboId, suscripcionId: rec.suscripcion_id },
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
  // TARJETA usa el MISMO id de factura que `cobrarReciboOffSession`: si el
  // camino síncrono ya selló, esto colisiona y no duplica.
  const facturaId = facturaIdMetodoGuardado(reciboId, metodo);

  // La transición la decide el dueño único (lib/billing/confirmar-cobro.ts):
  // compare-and-set con las guardas de estado y de reembolso, y un DEVUELTO
  // con este mismo cargo no se resucita (un adeudo SEPA se puede devolver
  // hasta 8 semanas después, así que succeeded → refunded → reentrega del
  // succeeded original es real). Si gana, aplica renovación → factura →
  // aviso → email, en ese orden: antes el email salía antes de sellar y el
  // justificante llegaba sin número de factura.
  const r = await confirmarCobro(admin, {
    studioId, reciboId, metodo, origen: fuente,
    paymentIntentId: params.paymentIntentId ?? null,
    // Transición real: en SEPA es el camino normal; en TARJETA significa que el
    // webhook acaba de RECUPERAR un cobro que el camino síncrono perdió —
    // avisar a la socia es lo correcto: nadie más lo hará.
    avisarSocia: true,
    facturaId,
  });
  // 'Recibo no encontrado' lo usa el webhook para detectar un cobro que apunta
  // a un recibo inexistente o de OTRO estudio.
  if (!r.ok) {
    // Un cobro real sobre un recibo ANULADO (el estudio lo perdonó al cancelar la
    // cuota) o ya cobrado con otro cargo/sin cargo registrado: el dinero entró,
    // no se renueva ni se sella nada y `confirmarCobro` ya avisó para
    // devolverlo. No es un fallo que reintentar: el llamador lo verá igual.
    if (r.codigo === 'NO_COBRABLE' && (r.estado === 'ANULADO' || r.estado === 'COBRADO')) return { ok: true };
    return { ok: false, error: r.codigo === 'NO_ENCONTRADO' ? 'Recibo no encontrado' : r.error };
  }

  // Ya COBRADO con este cargo. En TARJETA es el caso NORMAL —el webhook llega
  // para cada cargo y `cobrarReciboOffSession` ya lo confirmó de forma
  // síncrona—; en SEPA, una reentrega. Se repara en silencio lo idempotente
  // (la única red si el proceso murió entre la transición y sus efectos) pero
  // SIN email: el email no es idempotente y ya lo pidió quien ganó.
  if (r.transicion === 'ya_estaba') {
    await aplicarEfectosCobro(admin, {
      studioId, reciboId, metodo, origen: fuente, facturaId, avisarSocia: false, reparacion: true,
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

// Tarjeta regalo — puente con Stripe. El webhook (fuente de verdad), la página de vuelta
// (que consulta a Stripe por si el webhook tarda) y el conciliador (la red si ambos fallan)
// llaman a la MISMA función, y todas son idempotentes por sesión: `regalo_crear` devuelve la
// misma tarjeta si ya existe.
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { leerSesionDeRegalo } from './sesion';
import { crearTarjeta, anularTarjeta } from './servidor';
import { enviarCorreosRegalo } from './enviar';

export type ResultadoActivacion =
  | { ok: true; tarjetaId: string; creada: boolean; anuladaAlNacer?: boolean }
  | { ok: false; motivo: string; detalle?: string };

/** ¿El cobro de este PaymentIntent ya está devuelto o en disputa? null = no se pudo saber. */
async function cobroRevertido(stripe: Stripe, piId: string, cuenta: string): Promise<'si' | 'no' | null> {
  try {
    const pi = await stripe.paymentIntents.retrieve(piId, { expand: ['latest_charge'] }, { stripeAccount: cuenta });
    const cargo = pi.latest_charge;
    if (!cargo || typeof cargo === 'string') return null;
    return cargo.refunded || (cargo.amount_refunded ?? 0) > 0 || cargo.disputed ? 'si' : 'no';
  } catch { return null; }
}

/**
 * Convierte una sesión de Checkout PAGADA en tarjeta. `studioAutorizado` es el estudio de la
 * cuenta Connect que firma (nunca el de la metadata): si no coinciden, no se crea.
 *
 * Si el cobro ya está devuelto o en disputa cuando llega aquí (el reembolso se adelantó a la
 * activación), la tarjeta se crea y se ANULA en el acto: queda el rastro y nunca con saldo.
 * Si no se puede consultar el cargo, no se crea nada (`stripe`): lo reintenta el conciliador.
 */
export async function activarRegaloDesdeSesion(
  admin: SupabaseClient, session: Stripe.Checkout.Session, studioAutorizado: string,
  stripe: Stripe, cuentaConnect: string,
): Promise<ResultadoActivacion> {
  const lectura = leerSesionDeRegalo(session.metadata as Record<string, string> | null, {
    amountTotal: session.amount_total, currency: session.currency, pagado: session.payment_status === 'paid',
  });
  if (!lectura.ok) return { ok: false, motivo: lectura.motivo };
  const d = lectura.datos;
  if (d.studioId !== studioAutorizado) return { ok: false, motivo: 'estudio-no-coincide' };

  const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;
  if (!piId) return { ok: false, motivo: 'sin-cobro' };

  const r = await crearTarjeta(admin, {
    studioId: d.studioId, origen: 'ONLINE', sessionId: session.id, paymentIntentId: piId,
    importeEur: d.importeEur, compradorNombre: d.compradorNombre, compradorEmail: d.compradorEmail,
    destinatarioNombre: d.destinatarioNombre, destinatarioEmail: d.destinatarioEmail, mensaje: d.mensaje || null,
    caducidadMeses: d.caducidadMeses, metodoManual: null, actorTipo: 'webhook', actorId: session.id,
  });
  if (!r.ok) return { ok: false, motivo: 'bd', detalle: r.error };

  if (r.creada) {
    const revertido = await cobroRevertido(stripe, piId, cuentaConnect);
    if (revertido !== 'no') {
      // Devuelto o sin poder comprobarlo: sin saldo vivo hasta saberlo. Si no se pudo consultar, se anula igual
      // (fail-closed) con un motivo que lo dice; el estudio puede volver a emitirla a mano si el cobro era bueno.
      await anularTarjeta(admin, d.studioId, r.tarjetaId,
        revertido === 'si' ? 'Cobro devuelto o en disputa antes de entregarse' : 'No se pudo comprobar el cobro al entregarla',
        'webhook', piId);
      return { ok: true, tarjetaId: r.tarjetaId, creada: true, anuladaAlNacer: true };
    }
  }

  // El correo sale una vez: se RECLAMA con un UPDATE atómico sobre `correo_enviado_en` y, si el envío falla,
  // se suelta para que el siguiente intento (webhook repetido, página de vuelta o conciliador) lo repita.
  const { data: reclamada } = await admin.from('tarjetas_regalo')
    .update({ correo_enviado_en: new Date().toISOString() })
    .eq('id', r.tarjetaId).eq('studio_id', d.studioId).eq('estado', 'ACTIVA').is('correo_enviado_en', null).select('id');
  if (reclamada && reclamada.length > 0) {
    const enviado = await enviarCorreosRegalo(admin, d.studioId, r.tarjetaId);
    if (!enviado.ok) {
      await admin.from('tarjetas_regalo').update({ correo_enviado_en: null }).eq('id', r.tarjetaId).eq('studio_id', d.studioId);
    }
  }
  return { ok: true, tarjetaId: r.tarjetaId, creada: r.creada };
}

/**
 * Reembolso total o disputa perdida de la compra: la tarjeta se anula y lo que quedara
 * de saldo se retira. Lo ya gastado no vuelve (decisión de producto, como los packs de IA).
 * Si la tarjeta aún no existe (el reembolso se adelantó), no hay nada que anular: lo cubre
 * `activarRegaloDesdeSesion`, que mira el cargo antes de dejar saldo vivo.
 */
export async function anularRegaloPorPago(
  admin: SupabaseClient, studioId: string, paymentIntentId: string, motivo: string,
): Promise<{ ok: boolean; encontrada: boolean }> {
  const { data: t } = await admin.from('tarjetas_regalo').select('id')
    .eq('studio_id', studioId).eq('payment_intent_id', paymentIntentId).maybeSingle();
  if (!t) return { ok: true, encontrada: false };
  const r = await anularTarjeta(admin, studioId, t.id as string, motivo, 'webhook', paymentIntentId);
  return { ok: r.ok, encontrada: true };
}

import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addonDePriceId, planDePriceId } from '../billing.ts';
import {
  eventosDeSuscripcion, filaDeFactura, filaDeIncidente, fotoDeSuscripcion, EVENTOS_DE_FACTURA,
  type Dueno, type FotoSuscripcion, type InvoiceMinima, type LineaPrecio, type MapaPrecios,
} from './reglas.ts';

// Escritura del libro de billing (Fase 1). El webhook de billing lo llama DESPUÉS de
// sincronizar el estado del estudio y NUNCA lo deja caer: es un espejo (Stripe sigue
// siendo la verdad), así que un fallo aquí se avisa a Sentry y el webhook responde
// 200. Lo que se pierda se recupera con el script de relleno desde Stripe.

const MAPA: MapaPrecios = { plan: planDePriceId, addon: addonDePriceId };

const idDe = (x: string | { id: string } | null | undefined): string | null => (typeof x === 'string' ? x : x?.id ?? null);

export function lineasDe(sub: Pick<Stripe.Subscription, 'items'> | { items?: { data?: Stripe.SubscriptionItem[] } }): LineaPrecio[] {
  return (sub.items?.data ?? []).map((it) => ({
    priceId: it.price?.id ?? null,
    unitAmount: it.price?.unit_amount ?? null,
    interval: it.price?.recurring?.interval ?? null,
    intervalCount: it.price?.recurring?.interval_count ?? null,
    quantity: it.quantity ?? 1,
  }));
}

/** Quién es el dueño de un cliente de Stripe: un estudio o una cadena (nunca los dos). */
export async function resolverDueno(admin: SupabaseClient, customerId: string | null, metadata?: Stripe.Metadata | null): Promise<Dueno> {
  const studioMeta = metadata?.studioId ?? null;
  const cadenaMeta = metadata?.cadenaId ?? null;
  if (cadenaMeta) return { studioId: null, cadenaId: cadenaMeta };
  if (studioMeta) return { studioId: studioMeta, cadenaId: null };
  if (!customerId) return { studioId: null, cadenaId: null };
  const { data: estudio } = await admin.from('studios').select('id').eq('stripe_customer_id', customerId).maybeSingle();
  if (estudio?.id) return { studioId: estudio.id as string, cadenaId: null };
  const { data: cadena } = await admin.from('cadenas').select('id').eq('stripe_customer_id', customerId).maybeSingle();
  return { studioId: null, cadenaId: (cadena?.id as string | undefined) ?? null };
}

/** La foto de una suscripción de Stripe tal como está ahora (para el relleno y los eventos). */
export function fotoDeStripe(sub: Stripe.Subscription): FotoSuscripcion {
  return fotoDeSuscripcion(lineasDe(sub), sub.status, Boolean(sub.cancel_at_period_end || sub.cancel_at), MAPA);
}

/**
 * La suscripción tal como era ANTES del evento, a partir de `previous_attributes`
 * (Stripe solo manda lo que cambió). Lo que no viene es lo que no cambió.
 */
function fotoAntes(sub: Stripe.Subscription, previos: Partial<Stripe.Subscription> | undefined, ahora: FotoSuscripcion): FotoSuscripcion | null {
  if (!previos) return null;
  const itemsPrevios = (previos as { items?: { data?: Stripe.SubscriptionItem[] } }).items;
  const lineas = itemsPrevios?.data ? lineasDe({ items: itemsPrevios }) : lineasDe(sub);
  const estado = typeof previos.status === 'string' ? previos.status : ahora.estado;
  const cancela = typeof previos.cancel_at_period_end === 'boolean' ? previos.cancel_at_period_end : ahora.cancelaAlFinal;
  return fotoDeSuscripcion(lineas, estado, cancela, MAPA);
}

async function apuntarSuscripcion(admin: SupabaseClient, event: Stripe.Event): Promise<void> {
  const sub = event.data.object as Stripe.Subscription;
  const customerId = idDe(sub.customer);
  const ahora = fotoDeSuscripcion(lineasDe(sub), sub.status, Boolean(sub.cancel_at_period_end || sub.cancel_at), MAPA);
  const previos = event.type === 'customer.subscription.updated'
    ? (event.data.previous_attributes as Partial<Stripe.Subscription> | undefined)
    : undefined;
  // `cancel_at` también programa una baja: si cambia, cuenta como cambio de baja.
  const previosConBaja = previos && ('cancel_at' in previos) && !('cancel_at_period_end' in previos)
    ? { ...previos, cancel_at_period_end: Boolean(previos.cancel_at) }
    : previos;
  const antes = fotoAntes(sub, previosConBaja, ahora);
  const eventos = eventosDeSuscripcion({ tipoEvento: event.type, despues: ahora, antes });
  if (eventos.length === 0) return;
  const dueno = await resolverDueno(admin, customerId, sub.metadata);
  const filas = eventos.map((e) => ({
    stripe_event_id: event.id,
    tipo: e.tipo,
    studio_id: dueno.studioId,
    cadena_id: dueno.studioId ? null : dueno.cadenaId,
    subscription_id: sub.id,
    customer_id: customerId,
    plan_antes: e.planAntes,
    plan_despues: e.planDespues,
    intervalo_antes: e.intervaloAntes,
    intervalo_despues: e.intervaloDespues,
    estado_antes: e.estadoAntes,
    estado_despues: e.estadoDespues,
    mrr_lista_antes_cents: e.mrrListaAntesCents,
    mrr_lista_despues_cents: e.mrrListaDespuesCents,
    detalle: e.detalle,
    ocurrido_en: new Date(event.created * 1000).toISOString(),
  }));
  // Una entrega repetida no duplica: `unique (stripe_event_id, tipo)`.
  const { error } = await admin.from('billing_eventos').upsert(filas, { onConflict: 'stripe_event_id,tipo', ignoreDuplicates: true });
  if (error) throw new Error(`billing_eventos: ${error.message}`);
}

/** Lo que se lee de una invoice de Stripe, ya en la forma mínima del libro. */
export function invoiceMinima(inv: Stripe.Invoice): InvoiceMinima {
  return {
    id: inv.id as string,
    status: inv.status ?? null,
    number: inv.number ?? null,
    billing_reason: inv.billing_reason ?? null,
    currency: inv.currency ?? null,
    total: inv.total ?? null,
    amount_paid: inv.amount_paid ?? null,
    amount_due: inv.amount_due ?? null,
    attempt_count: inv.attempt_count ?? null,
    next_payment_attempt: inv.next_payment_attempt ?? null,
    period_start: inv.period_start ?? null,
    period_end: inv.period_end ?? null,
    created: inv.created,
    hosted_invoice_url: inv.hosted_invoice_url ?? null,
    invoice_pdf: inv.invoice_pdf ?? null,
    impuestosCents: (inv.total_taxes ?? []).reduce((t, x) => t + x.amount, 0),
    paid_at: inv.status_transitions?.paid_at ?? null,
  };
}

async function apuntarFactura(admin: SupabaseClient, event: Stripe.Event): Promise<ResultadoLibro> {
  const inv = event.data.object as Stripe.Invoice;
  const subscriptionId = idDe(inv.parent?.subscription_details?.subscription ?? null);
  // Una factura que no es de una suscripción (un cobro suelto de otra cosa) no es del libro.
  if (!subscriptionId) return {};
  const customerId = idDe(inv.customer);
  const dueno = await resolverDueno(admin, customerId, inv.parent?.subscription_details?.metadata);
  const contexto = { dueno, customerId, subscriptionId, eventoCreado: event.created };
  const min = invoiceMinima(inv);
  const fila = filaDeFactura(min, contexto);
  if (!fila) return {};

  const { error } = await admin.rpc('billing_registrar_factura', { p: fila });
  if (error) throw new Error(`billing_registrar_factura: ${error.message}`);

  // La factura primero, el incidente después: `billing_abrir_incidente` mira la fila
  // para no abrir uno de una factura que ya consta pagada (un fallo entregado tarde).
  if (event.type === 'invoice.payment_failed') {
    const { error: e2 } = await admin.rpc('billing_abrir_incidente', { p: filaDeIncidente(min, contexto) });
    if (e2) throw new Error(`billing_abrir_incidente: ${e2.message}`);
  } else if (event.type === 'invoice.paid' || event.type === 'invoice.voided' || event.type === 'invoice.marked_uncollectible') {
    const cierre = event.type === 'invoice.paid'
      ? new Date((min.paid_at ?? event.created) * 1000).toISOString()
      : new Date(event.created * 1000).toISOString();
    const { data: cerrado, error: e3 } = await admin.rpc('billing_cerrar_incidente', {
      p_stripe_invoice_id: inv.id, p_en: cierre, p_estado: event.type === 'invoice.paid' ? 'RECUPERADO' : 'CANCELADO',
    });
    if (e3) throw new Error(`billing_cerrar_incidente: ${e3.message}`);
    // La función devuelve 'recuperado' SOLO la primera vez: quien llama manda el «ya está al día» una vez.
    return { facturaId: inv.id, incidenteCerrado: cierreDe(cerrado) };
  }
  return { facturaId: inv.id };
}

/** Lo que el libro cuenta a quien lo llama: si este evento cerró un incidente de pago. */
export interface ResultadoLibro {
  facturaId?: string;
  incidenteCerrado?: 'recuperado' | 'cancelado';
}

const cierreDe = (r: unknown): ResultadoLibro['incidenteCerrado'] =>
  r === 'recuperado' ? 'recuperado' : r === 'cancelado' ? 'cancelado' : undefined;

/**
 * Apunta en el libro lo que dice un evento del webhook de billing. Lanza si falla:
 * quien llama decide (el webhook lo captura, lo avisa y sigue).
 */
export async function apuntarEnElLibro(admin: SupabaseClient, event: Stripe.Event): Promise<ResultadoLibro> {
  if (event.type.startsWith('customer.subscription.')) { await apuntarSuscripcion(admin, event); return {}; }
  if ((EVENTOS_DE_FACTURA as readonly string[]).includes(event.type)) return apuntarFactura(admin, event);
  return {};
}

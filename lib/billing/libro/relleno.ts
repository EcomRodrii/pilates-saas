import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { filaDeFactura } from './reglas.ts';
import { facturaDePaymentIntent, fotoDeStripe, invoiceMinima, resolverDueno } from './servidor.ts';

// Rellena el libro de billing con lo que YA existe en Stripe: el alta (y la cancelación, si la
// hubo) de cada suscripción y todas las facturas de suscripciones. El webhook solo apunta lo que
// pasa desde que existe el libro; sin esto las métricas de revenue empezarían vacías.
//
// ⚠️ SOLO LEE de Stripe. Escribe únicamente en NUESTRA base de datos (el libro), y solo con
// `ejecutar`: sin él es un ensayo que cuenta lo que haría. Idempotente: se puede repetir.
//
// Las facturas entran con la hora de AHORA como «último evento» (es una foto de este instante):
// un evento más viejo que llegue después no la pisa, y una factura que cambió mientras faltaba
// un webhook queda al día.
//
// Lo que NO hace, a propósito:
//   · No abre incidentes de pago: el cron de impagos mandaría el aviso del día 0 a estudios que
//     fallaron hace semanas. Los incidentes nacen de los fallos que llegan desde ahora.
//   · No reconstruye cambios de plan pasados (Stripe solo guarda 30 días de eventos). El «alta»
//     lleva el plan y el periodo de HOY, y lo dice en su `detalle`.

export interface ResumenRelleno {
  ejecutado: boolean;
  suscripciones: number;
  eventos: number;
  facturas: number;
  facturasAjenas: number;
  devoluciones: number;
  sinDueno: number;
  errores: string[];
}

const iso = (unix: number) => new Date(unix * 1000).toISOString();
const idDe = (x: string | { id: string } | null | undefined): string | null => (typeof x === 'string' ? x : x?.id ?? null);

export async function rellenarLibro(
  db: SupabaseClient, stripe: Stripe, opciones: { ejecutar: boolean; ahora?: number },
): Promise<ResumenRelleno> {
  const { ejecutar } = opciones;
  const ahora = opciones.ahora ?? Math.floor(Date.now() / 1000);
  const r: ResumenRelleno = { ejecutado: ejecutar, suscripciones: 0, eventos: 0, facturas: 0, facturasAjenas: 0, devoluciones: 0, sinDueno: 0, errores: [] };

  for await (const sub of stripe.subscriptions.list({ status: 'all', limit: 100 })) {
    r.suscripciones++;
    const customerId = idDe(sub.customer);
    const dueno = await resolverDueno(db, customerId, sub.metadata);
    if (!dueno.studioId && !dueno.cadenaId) r.sinDueno++;
    const foto = fotoDeStripe(sub);
    const base = {
      studio_id: dueno.studioId, cadena_id: dueno.studioId ? null : dueno.cadenaId,
      subscription_id: sub.id, customer_id: customerId,
      plan_despues: foto.plan, intervalo_despues: foto.intervalo, mrr_lista_despues_cents: foto.mrrListaCents,
      detalle: { relleno: true, nota: 'plan y periodo de hoy, no los del momento del alta', addons: foto.addons },
    };
    const filas = [{ ...base, stripe_event_id: `relleno:${sub.id}`, tipo: 'ALTA', estado_despues: 'active', ocurrido_en: iso(sub.created) }];
    if (sub.status === 'canceled' && sub.ended_at) {
      filas.push({ ...base, stripe_event_id: `relleno:${sub.id}`, tipo: 'CANCELADA', estado_despues: 'canceled', ocurrido_en: iso(sub.ended_at) });
    }
    r.eventos += filas.length;
    if (ejecutar) {
      const { error } = await db.from('billing_eventos').upsert(filas, { onConflict: 'stripe_event_id,tipo', ignoreDuplicates: true });
      if (error) r.errores.push(`suscripción ${sub.id}: ${error.message}`);
    }
  }

  for await (const inv of stripe.invoices.list({ limit: 100 })) {
    const subscriptionId = idDe(inv.parent?.subscription_details?.subscription ?? null);
    if (!subscriptionId) { r.facturasAjenas++; continue; }
    const customerId = idDe(inv.customer);
    const dueno = await resolverDueno(db, customerId, inv.parent?.subscription_details?.metadata);
    const fila = filaDeFactura(invoiceMinima(inv), { dueno, customerId, subscriptionId, eventoCreado: ahora });
    if (!fila) { r.facturasAjenas++; continue; }
    r.facturas++;
    if (ejecutar) {
      const { error } = await db.rpc('billing_registrar_factura', { p: fila });
      if (error) r.errores.push(`factura ${inv.id}: ${error.message}`);
    }
  }

  // Devoluciones ya hechas: lo devuelto por cada cargo (un cargo puede tener varios reembolsos) → su factura.
  // Después de las facturas, para que la fila ya exista.
  const devueltoPorPago = new Map<string, number>();
  for await (const re of stripe.refunds.list({ limit: 100 })) {
    const pi = idDe(re.payment_intent);
    if (!pi || re.status !== 'succeeded') continue;
    devueltoPorPago.set(pi, (devueltoPorPago.get(pi) ?? 0) + re.amount);
  }
  for (const [pi, cents] of devueltoPorPago) {
    const facturaId = await facturaDePaymentIntent(stripe, pi);
    if (!facturaId) continue; // un reembolso que no es de una suscripción (un pack, una socia…)
    r.devoluciones++;
    if (ejecutar) {
      const { error } = await db.rpc('billing_registrar_devolucion', { p_stripe_invoice_id: facturaId, p_devuelto_cents: cents });
      if (error) r.errores.push(`devolución de ${facturaId}: ${error.message}`);
    }
  }
  return r;
}

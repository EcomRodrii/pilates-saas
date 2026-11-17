/**
 * Rellena el libro de billing (billing_eventos, billing_facturas) con lo que YA existe en
 * Stripe: todas las facturas de suscripciones y el alta (y la cancelación, si la hubo) de cada
 * suscripción. El webhook solo apunta lo que pasa desde que existe el libro; sin esto las
 * métricas de revenue empezarían vacías.
 *
 * ⚠️ SOLO LEE de Stripe. No modifica ninguna suscripción, factura ni cliente. Escribe en
 * NUESTRA base de datos (el libro), y solo con `--ejecutar`: por defecto es un ensayo que
 * cuenta lo que haría.
 *
 * Es idempotente: se puede repetir. Las facturas entran con la hora de AHORA como «último
 * evento» (es una foto de este instante), así que un evento más viejo que llegue después no la
 * pisa, y una factura que cambió mientras faltaba un webhook queda al día.
 *
 * Lo que NO hace, a propósito:
 *   · No abre incidentes de pago: el cron de impagos mandaría el aviso del día 0 a estudios que
 *     fallaron hace semanas. Los incidentes nacen de los fallos que llegan desde ahora.
 *   · No reconstruye cambios de plan pasados (Stripe solo guarda 30 días de eventos). El «alta»
 *     lleva el plan y el periodo de HOY, y lo dice en su `detalle`.
 *
 * USO (con la clave de Stripe del entorno que se quiera leer y la service-role de Supabase):
 *   STRIPE_SECRET_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/billing-relleno-libro.ts
 *   STRIPE_SECRET_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/billing-relleno-libro.ts --ejecutar
 */
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { filaDeFactura } from '../lib/billing/libro/reglas.ts';
import { fotoDeStripe, invoiceMinima, resolverDueno } from '../lib/billing/libro/servidor.ts';

const ejecutar = process.argv.includes('--ejecutar');
const faltan = ['STRIPE_SECRET_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((v) => !process.env[v]);
if (faltan.length) {
  console.error(`Faltan variables de entorno: ${faltan.join(', ')}`);
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: '2026-06-24.dahlia' });
const db = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false } });
const iso = (unix: number) => new Date(unix * 1000).toISOString();
const idDe = (x: string | { id: string } | null | undefined): string | null => (typeof x === 'string' ? x : x?.id ?? null);

const cuenta = { suscripciones: 0, eventos: 0, facturas: 0, facturasAjenas: 0, sinDueno: 0, errores: 0 };
const ahora = Math.floor(Date.now() / 1000);

console.log(ejecutar ? 'EJECUTANDO: se escribirá en el libro.' : 'ENSAYO: no se escribe nada (añade --ejecutar para aplicarlo).');

// ── 1. Suscripciones: el alta y, si se acabó, la cancelación ────────────────
for await (const sub of stripe.subscriptions.list({ status: 'all', limit: 100 })) {
  cuenta.suscripciones++;
  const customerId = idDe(sub.customer);
  const dueno = await resolverDueno(db, customerId, sub.metadata);
  if (!dueno.studioId && !dueno.cadenaId) cuenta.sinDueno++;
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
  cuenta.eventos += filas.length;
  if (ejecutar) {
    const { error } = await db.from('billing_eventos').upsert(filas, { onConflict: 'stripe_event_id,tipo', ignoreDuplicates: true });
    if (error) { cuenta.errores++; console.error(`  suscripción ${sub.id}: ${error.message}`); }
  }
}

// ── 2. Facturas de suscripciones ────────────────────────────────────────────
for await (const inv of stripe.invoices.list({ limit: 100 })) {
  const subscriptionId = idDe(inv.parent?.subscription_details?.subscription ?? null);
  if (!subscriptionId) { cuenta.facturasAjenas++; continue; }
  const customerId = idDe(inv.customer);
  const dueno = await resolverDueno(db, customerId, inv.parent?.subscription_details?.metadata);
  const fila = filaDeFactura(invoiceMinima(inv), { dueno, customerId, subscriptionId, eventoCreado: ahora });
  if (!fila) { cuenta.facturasAjenas++; continue; }
  cuenta.facturas++;
  if (ejecutar) {
    const { error } = await db.rpc('billing_registrar_factura', { p: fila });
    if (error) { cuenta.errores++; console.error(`  factura ${inv.id}: ${error.message}`); }
  }
}

console.log(JSON.stringify(cuenta, null, 2));
if (cuenta.sinDueno > 0) console.log(`Aviso: ${cuenta.sinDueno} suscripción(es) sin estudio ni cadena asociados (quedan con dueño vacío).`);
if (cuenta.errores > 0) process.exit(1);

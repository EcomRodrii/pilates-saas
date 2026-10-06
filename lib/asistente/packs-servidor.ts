// ─────────────────────────────────────────────────────────────────────────────
// La compra de un pack de consultas en Stripe: abrir el Checkout y, a la vuelta,
// LEER en qué ha quedado. Nada de aquí crea packs (eso es solo del webhook de la
// plataforma, lib/asistente/packs-libro.ts).
//
// Es la cuenta de PLATAFORMA de Tentare —la misma que cobra la suscripción SaaS
// (/api/billing/checkout)—, nunca Connect: es Tentare cobrando al estudio, no
// el estudio a una socia.
//
// Precio en línea (`price_data`) desde el catálogo en código (lib/asistente/
// packs.ts): el fundador no tiene que crear productos ni variables de entorno, y
// el importe que se cobra es el mismo número que enseña la pantalla.
//
// IVA: igual que la suscripción SaaS, que hoy NO calcula impuestos en Stripe
// (su Checkout no lleva `automatic_tax`). El precio es con IVA INCLUIDO tal
// cual; `tax_behavior: 'inclusive'` solo lo declara —sin `automatic_tax` no
// cambia ni un céntimo— para que el día que se active Stripe Tax el 9 € siga
// siendo 9 € y no 9 € + IVA. Configurar el impuesto es decisión del fundador.
// ─────────────────────────────────────────────────────────────────────────────

import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { leerCadenaDeLaSede, clienteDelPortal } from '@/lib/billing/sede-incluida-en-cadena';
import { ORIGEN_PACK, PACK_CADUCA_MESES, centimosDe, miles, type PackConsultas } from './packs.ts';

export type DesdeCompra = 'asistente' | 'suscripcion';

/**
 * El cliente de Stripe al que se factura: el mismo que abre el portal de
 * Suscripción (`clienteDelPortal`), para que la factura del pack salga junto a
 * las del plan. Si el estudio aún no tiene ninguno (prueba gratuita), se crea
 * —como haría /api/billing/checkout— y se guarda en el estudio sin pisar otro.
 */
async function clienteDelEstudio(
  admin: SupabaseClient, stripe: Stripe,
  studio: { id: string; nombre: string | null; email: string | null; cadena_id: string | null; stripe_customer_id: string | null },
): Promise<string> {
  const cadena = await leerCadenaDeLaSede(admin, studio.cadena_id);
  const existente = clienteDelPortal(studio.stripe_customer_id, cadena);
  if (existente) return existente;
  const customer = await stripe.customers.create({
    email: studio.email ?? undefined,
    name: studio.nombre ?? undefined,
    metadata: { studioId: studio.id },
  });
  const { data, error } = await admin.from('studios')
    .update({ stripe_customer_id: customer.id }).eq('id', studio.id).is('stripe_customer_id', null).select('id');
  if (error) throw new Error(`guardar el cliente de Stripe: ${error.message}`);
  if (data?.length) return customer.id;
  // Otra petición lo guardó antes: se usa el suyo.
  const { data: fila } = await admin.from('studios').select('stripe_customer_id').eq('id', studio.id).maybeSingle();
  return (fila as { stripe_customer_id: string | null } | null)?.stripe_customer_id ?? customer.id;
}

export async function crearCheckoutPack(o: {
  admin: SupabaseClient;
  stripe: Stripe;
  studioId: string;
  pack: PackConsultas;
  desde: DesdeCompra;
  appUrl: string;
}): Promise<{ url: string } | { error: 'ESTUDIO' }> {
  const { admin, stripe, studioId, pack, desde, appUrl } = o;
  const { data: studio } = await admin.from('studios')
    .select('id, nombre, email, cadena_id, stripe_customer_id').eq('id', studioId).maybeSingle();
  if (!studio) return { error: 'ESTUDIO' };
  const customer = await clienteDelEstudio(admin, stripe, studio as Parameters<typeof clienteDelEstudio>[2]);

  const nombre = `${miles(pack.unidades)} consultas de Tentare`;
  const metadata = { origen: ORIGEN_PACK, studio_id: studioId, pack: String(pack.unidades) };
  const volver = new URLSearchParams({ pack: 'ok', desde });
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    // Solo tarjeta (Apple Pay y Google Pay van dentro): un adeudo SEPA tarda días
    // en confirmarse y se puede devolver hasta 8 semanas después, con las
    // consultas ya gastadas y pagadas a Anthropic. Ampliarlo es decisión del fundador.
    payment_method_types: ['card'],
    customer,
    client_reference_id: studioId,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: centimosDe(pack),
        tax_behavior: 'inclusive',
        product_data: {
          name: nombre,
          description: `Pack de consultas de «Pregúntale a Tentare». Se gastan después de las de tu plan y caducan a los ${PACK_CADUCA_MESES} meses.`,
        },
      },
    }],
    metadata,
    payment_intent_data: { metadata, description: nombre },
    invoice_creation: { enabled: true, invoice_data: { description: nombre, metadata } },
    // El `{CHECKOUT_SESSION_ID}` lo sustituye Stripe: la página de vuelta lo usa para LEER el estado.
    success_url: `${appUrl}/suscripcion?${volver.toString()}&session_id={CHECKOUT_SESSION_ID}#consultas`,
    cancel_url: desde === 'asistente' ? `${appUrl}/asistente` : `${appUrl}/suscripcion?pack=cancel#consultas`,
    locale: 'es',
    submit_type: 'pay',
  }, {
    // Doble clic o dos pestañas a la vez: la MISMA sesión, no dos. Ventana de 10 s
    // (no un minuto): pagar y volver a comprar el mismo pack enseguida no debe
    // devolver la sesión ya pagada.
    idempotencyKey: `ia-pack-${studioId}-${pack.unidades}-${desde}-${Math.floor(Date.now() / 10_000)}`,
  });
  if (!session.url) throw new Error('Stripe no devolvió la URL del Checkout');
  return { url: session.url };
}

export type EstadoCompra =
  | { estado: 'ACREDITADO'; unidades: number; caducaEn: string }
  | { estado: 'REEMBOLSADO'; unidades: number }
  /** Stripe dice pagado y el webhook aún no ha llegado. */
  | { estado: 'CONFIRMANDO' }
  /** Pago diferido (SEPA…) en curso: puede tardar días. */
  | { estado: 'PROCESANDO' }
  | { estado: 'SIN_PAGAR' }
  | { estado: 'DESCONOCIDO' };

/**
 * En qué ha quedado una compra, para la página de vuelta. Primero el libro (lo
 * que manda); si el pack aún no está, se pregunta a Stripe por la sesión, y
 * solo si es de un pack DE ESTE estudio. Nunca escribe.
 */
export async function estadoDeCompra(admin: SupabaseClient, stripe: Stripe | null, studioId: string, sessionId: string): Promise<EstadoCompra | null> {
  const { data, error } = await admin.from('ia_packs')
    .select('unidades, caduca_en, estado').eq('studio_id', studioId).eq('stripe_checkout_session_id', sessionId).maybeSingle();
  if (error) throw new Error(`leer pack: ${error.message}`);
  const fila = data as { unidades: number; caduca_en: string; estado: string } | null;
  if (fila) {
    return fila.estado === 'ACTIVO'
      ? { estado: 'ACREDITADO', unidades: fila.unidades, caducaEn: fila.caduca_en }
      : { estado: 'REEMBOLSADO', unidades: fila.unidades };
  }
  if (!stripe) return { estado: 'DESCONOCIDO' };
  let s: Stripe.Checkout.Session;
  try {
    s = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] });
  } catch (e) {
    // Una sesión que no existe es lo mismo que una ajena: 404. Otro fallo (red, Stripe caído): no se sabe.
    if ((e as { code?: string })?.code === 'resource_missing') return null;
    return { estado: 'DESCONOCIDO' };
  }
  // Una sesión que no es un pack de ESTE estudio no existe para quien pregunta.
  if (s.metadata?.origen !== ORIGEN_PACK || s.metadata?.studio_id !== studioId) return null;
  if (s.status === 'complete') {
    if (s.payment_status === 'paid') return { estado: 'CONFIRMANDO' };
    // Un pago diferido que FALLÓ (async_payment_failed) deja la sesión «complete» y sin pagar para siempre.
    const pi = typeof s.payment_intent === 'object' ? s.payment_intent : null;
    if (pi && (pi.status === 'requires_payment_method' || pi.status === 'canceled')) return { estado: 'SIN_PAGAR' };
    return { estado: 'PROCESANDO' };
  }
  return { estado: 'SIN_PAGAR' };
}

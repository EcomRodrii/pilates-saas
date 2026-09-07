// ─────────────────────────────────────────────────────────────────────────────
// Guardar la tarjeta (Customer + PaymentMethod) tras un cobro exitoso, en UN
// SOLO SITIO — mismo patrón que confirmar-cobro.ts (F-12/F-13).
//
// Auditoría 26ª pasada, P-2. Antes esto vivía duplicado en las dos ramas del
// webhook (checkout.session.completed y payment_intent.succeeded del checkout
// embebido) y el conciliador — que es el camino REAL en 4 de cada 6 cobros
// (cabecera de lib/inngest/conciliar-cobros.ts) — no lo hacía en absoluto.
// Resultado medido en producción: 16 de 16 suscripciones MENSUAL activas sin
// ningún método de pago guardado, 0 socias con tarjeta guardada. La renovación
// automática, que es el modelo de negocio, no había cobrado a nadie nunca.
//
// Dos matices que el helper preserva EXPLÍCITAMENTE en vez de colapsarlos:
//
//  1. El guard de identidad (`exigirIdentidadDemostrada`). En Modo A (Checkout
//     Session) el `socioId` de la metadata ya viene verificado por quien creó
//     la sesión (JWT o fila de recibo en BD) — no hace falta guard. En Modo B
//     (checkout embebido) una compra de invitada puede resolver por email una
//     ficha que YA EXISTÍA (auditoría 25-ago): sin el guard, cualquiera que
//     supiera el email de una socia real podía dejarle SU tarjeta guardada.
//     Ver lib/billing/identidad-compra.ts.
//
//  2. Bloqueante vs best-effort. El webhook puede devolver 5xx para que Stripe
//     reintente (idempotente: mismos customer/payment_method). El conciliador
//     es un cron: no hay a quién devolverle un código HTTP, así que un fallo
//     aquí va a Sentry, nunca lanza — el bono ya entregado no puede tumbarse
//     porque falle el remate. Por eso esta función NUNCA lanza: devuelve un
//     resultado y el llamador decide qué hacer con un fallo.
// ─────────────────────────────────────────────────────────────────────────────
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { metodoReutilizableDe, type PaymentIntentReutilizable } from './metodo-reutilizable.ts';
import { guardarCaducidadTarjeta } from './caducidad-tarjeta.ts';
import { identidadDemostradaEnCompra } from './identidad-compra.ts';

export type ResultadoGuardarMetodo =
  | { ok: true; guardado: boolean }
  | { ok: false; guardado: false; motivo: string };

export async function guardarMetodoDeCompra(
  admin: SupabaseClient,
  stripe: Stripe,
  args: {
    studioId: string | null | undefined;
    socioId: string | null | undefined;
    customerId: string | null | undefined;
    stripeAccount: string | null | undefined;
    /**
     * Uno de los dos, nunca ninguno ni los dos:
     *  - `paymentIntentId`: solo tenemos el id (Modo A) — se recupera y se
     *    expande `payment_method`, igual que hacía el webhook.
     *  - `paymentIntent`: ya tenemos el objeto vivo (Modo B: el propio evento
     *    YA ES el PaymentIntent, o el conciliador ya lo cargó del listado).
     */
    paymentIntentId?: string | null;
    paymentIntent?: PaymentIntentReutilizable | null;
    /** Ver el punto 1 de la cabecera. `false` en Modo A (ya viene verificado). */
    exigirIdentidadDemostrada: boolean;
    /** Solo se leen si `exigirIdentidadDemostrada`. */
    socioIdVerificado?: string | null;
    fichaCreada?: boolean;
  },
): Promise<ResultadoGuardarMetodo> {
  if (!args.socioId || !args.studioId || typeof args.customerId !== 'string') {
    return { ok: true, guardado: false };
  }

  if (args.exigirIdentidadDemostrada) {
    const demostrada = identidadDemostradaEnCompra({
      socioIdVerificado: args.socioIdVerificado, fichaCreada: args.fichaCreada ?? false,
    });
    if (!demostrada) return { ok: true, guardado: false };
  }

  let pi: PaymentIntentReutilizable;
  if (args.paymentIntent) {
    pi = args.paymentIntent;
  } else if (args.paymentIntentId) {
    try {
      pi = await stripe.paymentIntents.retrieve(
        args.paymentIntentId,
        // Expandido a propósito: sin el objeto no se sabe con qué método se
        // pagó DE VERDAD, solo qué métodos se ofrecieron (ver metodo-reutilizable.ts).
        { expand: ['payment_method'] },
        args.stripeAccount ? { stripeAccount: args.stripeAccount } : undefined,
      );
    } catch (e) {
      return { ok: false, guardado: false, motivo: `no se pudo recuperar el PaymentIntent: ${String(e)}` };
    }
  } else {
    return { ok: true, guardado: false };
  }

  const paymentMethodId = metodoReutilizableDe(pi);
  if (!paymentMethodId) return { ok: true, guardado: false };

  const { error } = await admin.from('socios')
    .update({ stripe_customer_id: args.customerId, stripe_payment_method_id: paymentMethodId })
    .eq('id', args.socioId).eq('studio_id', args.studioId);
  if (error) return { ok: false, guardado: false, motivo: error.message };

  // Best-effort SIEMPRE (ver su propia cabecera): el método de pago —lo que
  // importa— ya está guardado; perder la fecha de caducidad es secundario.
  await guardarCaducidadTarjeta(admin, stripe, {
    socioId: args.socioId, studioId: args.studioId, paymentMethodId, stripeAccount: args.stripeAccount,
  });

  return { ok: true, guardado: true };
}

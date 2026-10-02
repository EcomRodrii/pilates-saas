// ─────────────────────────────────────────────────────────────────────────────
// La caducidad de la tarjeta guardada de una socia.
//
// Un solo sitio que sabe leerla de Stripe y persistirla, porque hay dos caminos
// que la escriben y divergirían: el webhook (al guardar una tarjeta nueva) y el
// relleno por goteo del cron de dunning (para las que ya estaban guardadas
// antes de que existieran estas columnas).
//
// ⚠️ Best-effort SIEMPRE. Esto es un dato de aviso, no una condición de cobro:
// si Stripe no responde, o el método ya no existe, o es un SEPA en vez de una
// tarjeta, se devuelve `null` y no pasa nada. Lo que NO puede hacer nunca es
// tumbar el webhook que confirma un pago ni el barrido que reintenta cobros —
// perder el mes de caducidad es molesto; perder la confirmación de un cobro es
// dinero.
// ─────────────────────────────────────────────────────────────────────────────
import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CaducidadTarjeta {
  expMes: number;
  expAnio: number;
  marca: string | null;
  ultimos4: string | null;
}

/** Extrae la caducidad de un PaymentMethod ya recuperado. `null` si no es una
 *  tarjeta o si Stripe no trae los campos (SEPA, Bizum, link...). */
export function caducidadDe(pm: Stripe.PaymentMethod | null | undefined): CaducidadTarjeta | null {
  const card = pm?.card;
  if (!card || typeof card.exp_month !== 'number' || typeof card.exp_year !== 'number') return null;
  if (card.exp_month < 1 || card.exp_month > 12) return null;
  return {
    expMes: card.exp_month,
    expAnio: card.exp_year,
    marca: card.brand ?? null,
    // El CHECK de la tabla exige exactamente 4 dígitos; si Stripe devolviera
    // otra cosa se guarda null antes que reventar el INSERT.
    ultimos4: /^\d{4}$/.test(card.last4 ?? '') ? card.last4! : null,
  };
}

/**
 * Lee la tarjeta de Stripe y la guarda en `socios`. Devuelve lo guardado, o
 * `null` si no se pudo (y entonces no escribe nada).
 *
 * `stripeAccount` es la cuenta conectada del estudio: los PaymentMethod de las
 * socias viven ahí, no en la plataforma — sin targetearla Stripe responde
 * "no such payment_method".
 */
export async function guardarCaducidadTarjeta(
  admin: SupabaseClient,
  stripe: Stripe,
  p: { socioId: string; studioId: string; paymentMethodId: string; stripeAccount?: string | null },
): Promise<CaducidadTarjeta | null> {
  try {
    const pm = await stripe.paymentMethods.retrieve(
      p.paymentMethodId, {},
      p.stripeAccount ? { stripeAccount: p.stripeAccount } : undefined,
    );
    const caducidad = caducidadDe(pm);
    // ⚠️ Un Link sustituye a la tarjeta anterior en `stripe_payment_method_id`,
    // pero no trae caducidad ni últimos cuatro. Sin limpiar, el portal seguía
    // enseñando «Visa •••• 4242, caduca…» —una tarjeta que ya no se cobra— y el
    // aviso de caducidad saltaba por ella. Se guarda `tarjeta_marca = 'link'` y
    // el resto a null: el portal enseña «Link» (y deja quitarlo), y el relleno
    // del cron de dunning no lo vuelve a pedir cada día.
    const esLink = !caducidad && pm?.type === 'link';
    if (!caducidad && !esLink) return null;

    // Acotado por studio_id además de por id: mismo criterio que el resto de
    // escrituras del webhook — nunca un UPDATE sin tenant sobre un id que
    // viene de metadata.
    const { error } = await admin.from('socios').update(caducidad
      ? {
        tarjeta_exp_mes: caducidad.expMes,
        tarjeta_exp_anio: caducidad.expAnio,
        tarjeta_marca: caducidad.marca,
        tarjeta_ultimos4: caducidad.ultimos4,
      }
      : { tarjeta_exp_mes: null, tarjeta_exp_anio: null, tarjeta_marca: 'link', tarjeta_ultimos4: null },
    ).eq('id', p.socioId).eq('studio_id', p.studioId);
    if (error) {
      console.error('[caducidad-tarjeta] no se pudo guardar', p.socioId, error);
      return null;
    }
    return caducidad;
  } catch (e) {
    // Ver la nota de arriba: esto nunca propaga.
    console.error('[caducidad-tarjeta] Stripe no devolvió el método', p.paymentMethodId, e);
    // Auditoría de cobros recurrentes (2026-09-29): «resource_missing» es
    // Stripe confirmando que este método YA NO EXISTE (tarjeta eliminada por
    // la socia, cuenta Connect desconectada y reconectada…), no un fallo de
    // red pasajero — el resto de errores (timeout, 5xx) no entra aquí y se
    // reintenta solo mañana con el mismo id, como siempre. Sin este aviso, el
    // sistema seguía creyendo que había una tarjeta válida hasta que un cobro
    // de verdad fallaba contra ella — el hueco de "nadie verifica el método
    // antes de que lo intente el dunning" que encontró la auditoría.
    //
    // Compare-and-set por el propio id: si `guardar-metodo-de-compra.ts` ya
    // guardó una tarjeta NUEVA entre el fallo y este momento, este UPDATE no
    // toca nada (la condición `stripe_payment_method_id = p.paymentMethodId`
    // ya no se cumple) — nunca borra un método que ya no es el que falló.
    //
    // Limpiarlo (no solo avisar) reutiliza infraestructura ya existente sin
    // eventos nuevos: `sociosConMetodoCobro` (lib/inngest/renovaciones.ts) deja
    // de contar a esta socia, así que su próxima renovación entra sola por el
    // camino de "sin tarjeta" (`emitirRenovacionSinTarjeta`, ya construido)
    // en vez de fallar en silencio contra un método que Stripe ya rechazaba.
    if (e instanceof Stripe.errors.StripeError && e.code === 'resource_missing') {
      try {
        await admin.from('socios').update({
          stripe_payment_method_id: null,
          tarjeta_exp_mes: null, tarjeta_exp_anio: null, tarjeta_marca: null, tarjeta_ultimos4: null,
        }).eq('id', p.socioId).eq('studio_id', p.studioId).eq('stripe_payment_method_id', p.paymentMethodId);
      } catch (e2) {
        console.error('[caducidad-tarjeta] no se pudo limpiar el método muerto', p.socioId, e2);
      }
    }
    return null;
  }
}

// `nombreDeMarca` y `caducaAntesDe` viven en `tarjeta-caducidad.ts`, sin Stripe:
// las usa el panel en el navegador (la ficha de Cobros) y este fichero importa el SDK.
export { nombreDeMarca, caducaAntesDe } from './tarjeta-caducidad.ts';

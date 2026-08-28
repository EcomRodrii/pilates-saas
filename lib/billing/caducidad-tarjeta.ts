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
import type Stripe from 'stripe';
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
    if (!caducidad) return null;

    // Acotado por studio_id además de por id: mismo criterio que el resto de
    // escrituras del webhook — nunca un UPDATE sin tenant sobre un id que
    // viene de metadata.
    const { error } = await admin.from('socios').update({
      tarjeta_exp_mes: caducidad.expMes,
      tarjeta_exp_anio: caducidad.expAnio,
      tarjeta_marca: caducidad.marca,
      tarjeta_ultimos4: caducidad.ultimos4,
    }).eq('id', p.socioId).eq('studio_id', p.studioId);
    if (error) {
      console.error('[caducidad-tarjeta] no se pudo guardar', p.socioId, error);
      return null;
    }
    return caducidad;
  } catch (e) {
    // Ver la nota de arriba: esto nunca propaga.
    console.error('[caducidad-tarjeta] Stripe no devolvió el método', p.paymentMethodId, e);
    return null;
  }
}

// Stripe manda la marca en minúscula (`visa`, `mastercard`) — capitaliza para
// pantalla. Pura y sin dependencias, así que vive junto al resto de este
// fichero (client-safe: solo tipos de `stripe`, nunca el SDK en runtime) en
// vez de duplicarse entre /compras y /ajustes.
export function nombreDeMarca(marca: string | null | undefined): string {
  if (!marca) return 'Tarjeta';
  if (marca.toLowerCase() === 'visa') return 'Visa';
  return marca.charAt(0).toUpperCase() + marca.slice(1);
}

/**
 * ¿Caduca esta tarjeta en o antes de `fecha`? Una tarjeta con caducidad 09/2026
 * sirve hasta el ÚLTIMO día de septiembre de 2026, no hasta el primero — es el
 * error clásico y aquí se traduciría en avisar a la socia un mes antes de
 * tiempo (o peor, tarde).
 */
export function caducaAntesDe(
  tarjeta: { expMes: number | null; expAnio: number | null },
  fecha: Date,
): boolean {
  const { expMes, expAnio } = tarjeta;
  if (expMes == null || expAnio == null) return false; // sin dato no se afirma nada
  // Primer instante del mes SIGUIENTE al de caducidad = cuando deja de valer.
  const dejaDeValer = new Date(Date.UTC(expAnio, expMes, 1));
  return dejaDeValer.getTime() <= fecha.getTime();
}

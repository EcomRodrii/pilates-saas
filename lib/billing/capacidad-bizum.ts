import type Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';

// -----------------------------------------------------------------------------
// Por que existe: este repo conecta cada estudio via OAuth de Connect
// STANDARD (stripe.oauth.token, en el callback de conexion). El checkout
// (hospedado, widget, embebido, portal) ya manda payment_method_types:
// [card, bizum] desde hace semanas -- pero Bizum en un cargo DIRECTO
// (direct charge: el dinero va a la cuenta del estudio, no a la de la
// plataforma) exige la capacidad bizum_payments en estado active en la
// cuenta CONECTADA de cada estudio, no solo en la de la plataforma
// (https://docs.stripe.com/payments/bizum, seccion Connect). Sin pedirla,
// Bizum nunca aparece en el checkout de ningun estudio salvo el que la pidio
// a mano por soporte -- que es exactamente lo que se reporto.
//
// La plataforma SI puede pedir esta capacidad para una cuenta Standard via
// API (la doc lo confirma explicitamente para Standard, pese a que tienen su
// propio Dashboard): stripe.accounts.update(id, { capabilities: {
// bizum_payments: { requested: true } } }). Pedirla NO la activa al
// instante -- Stripe la deja en pending hasta comprobar que la cuenta tiene
// NIF/CIF (company.tax_id/vat_id) o DNI/NIE (individual.id_number) y
// business_type fijado; si esos datos ya estan completos (la mayoria de
// cuentas espanolas onboarded para cobrar con tarjeta los tienen, porque
// Stripe los exige para activar cobros), pasa a active rapido.
//
// Falla-suave SIEMPRE, mismo criterio que dominios-wallets.ts: pedir una
// capacidad es una mejora del checkout del estudio, nunca puede tumbar un
// flujo que ya guardo la conexion (alta nueva) ni, en un backfill posterior,
// dejar a medias el resto del lote.
// -----------------------------------------------------------------------------

export interface ResultadoCapacidadBizum {
  stripeAccount: string;
  ok: boolean;
  /** Estado que Stripe devuelve tras pedirla (queda undefined si el fallo
   *  fue de red/parseo antes de recibir respuesta). */
  estado?: Stripe.Account.Capabilities['bizum_payments'];
}

/** Pide bizum_payments sobre UNA cuenta conectada. Reutilizable tanto por
 *  el callback de OAuth (cuenta recien conectada) como por un backfill
 *  posterior sobre las cuentas ya conectadas -- una sola llamada a Stripe, no
 *  dos implementaciones que puedan divergir. Nunca lanza. */
export async function solicitarCapacidadBizum(
  stripe: Stripe,
  stripeAccount: string,
): Promise<ResultadoCapacidadBizum> {
  try {
    const cuenta = await stripe.accounts.update(stripeAccount, {
      capabilities: { bizum_payments: { requested: true } },
    });
    return { stripeAccount, ok: true, estado: cuenta.capabilities?.bizum_payments };
  } catch (e) {
    console.error('[capacidad-bizum] no se pudo solicitar bizum_payments para', stripeAccount, e);
    try {
      // Falla-suave hasta el final: bajo node --test (sin runtime de Next)
      // el namespace de @sentry/nextjs no expone captureException, y un
      // fallo del propio reporte tampoco puede propagar.
      Sentry.captureException(e instanceof Error ? e : new Error(String(e)), {
        tags: { modulo: 'capacidad-bizum' },
        extra: { stripeAccount },
      });
    } catch { /* el console.error de arriba ya deja rastro */ }
    return { stripeAccount, ok: false };
  }
}

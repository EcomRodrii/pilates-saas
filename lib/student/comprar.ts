'use client';

// Arrancar un cobro desde la app de la alumna.
//
// ⚠️ NO decide importes. Manda `planId` y el servidor resuelve el precio con
// `Number(plan.precio)` leyendo `planes_tarifa`
// (`app/api/public/checkout-embebido/route.ts`), exigiendo `plan.activo` y sin
// aceptar jamás una cantidad del cliente. Lo que se enseña en `/comprar` sale
// de esa misma fila, así que UI y cobro no pueden divergir.
//
// ⚠️ Tampoco reescribe Stripe: esta función solo pide el `clientSecret` que la
// ruta ya sabe emitir —con su clave de idempotencia, su descuento y su
// `setup_future_usage`— y se lo entrega a `CheckoutEmbebido`, el mismo
// componente que usa `/reservar`.

import { portalAuthHeader } from '@/lib/api-client';

export type InicioCobro =
  | { ok: true; clientSecret: string }
  | { ok: false; error: string; sesionCaducada?: boolean };

/**
 * Pide el `clientSecret` para cobrar un plan.
 *
 * Nunca lanza: cualquier fallo se traduce a un estado que la pantalla sabe
 * pintar. Si lanzara, la hoja de compra se quedaría en «Preparando el pago…»
 * para siempre, que es la peor pantalla posible cuando hay dinero de por medio.
 */
export async function iniciarCompra(
  studioId: string,
  planId: string,
  socioId: string | null,
): Promise<InicioCobro> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch('/api/public/checkout-embebido', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      // Solo identificadores. El importe lo pone el servidor.
      body: JSON.stringify({ studioId, planId, socioId }),
    });

    if (res.status === 401) {
      return { ok: false, sesionCaducada: true, error: 'Tu sesión ha caducado. Vuelve a entrar y no se te ha cobrado nada.' };
    }

    const cuerpo = (await res.json().catch(() => null)) as { clientSecret?: string; error?: string } | null;

    if (!res.ok) {
      // El texto del servidor es el bueno: distingue «plan no disponible» de
      // «el estudio no tiene Stripe conectado», y ese matiz importa.
      return { ok: false, error: cuerpo?.error ?? 'No hemos podido iniciar el pago. Inténtalo de nuevo.' };
    }
    if (!cuerpo?.clientSecret) {
      return { ok: false, error: 'No hemos podido iniciar el pago. No se te ha cobrado nada.' };
    }
    return { ok: true, clientSecret: cuerpo.clientSecret };
  } catch {
    return { ok: false, error: 'No hemos podido iniciar el pago. Comprueba tu conexión — no se te ha cobrado nada.' };
  }
}

/**
 * La clave publicable de Stripe, validada.
 *
 * Se valida la FORMA (`pk_`) y no solo que exista: una variable mal puesta —una
 * clave secreta pegada aquí por error, por ejemplo— haría fallar el montaje de
 * Stripe en el navegador con un error que la alumna no puede interpretar. Mejor
 * detectarlo antes y no ofrecer el pago.
 */
export function clavePublicableStripe(): string | null {
  const k = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  return typeof k === 'string' && k.startsWith('pk_') ? k : null;
}

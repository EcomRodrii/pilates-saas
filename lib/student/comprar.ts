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
  | {
      ok: true;
      clientSecret: string;
      /**
       * Lo que se va a cobrar DE VERDAD, dicho por el servidor.
       *
       * ⚠️ No se calcula aquí, y es deliberado. El descuento lo resuelve el
       * servidor y un código que ya no valga se IGNORA en silencio, así que
       * cualquier resta hecha en el cliente puede divergir del cargo. Este es
       * el importe con el que se creó el PaymentIntent: enseñar ESTE es la
       * única forma de que el precio mostrado sea el precio cobrado.
       */
      importe: number;
      /** Cuánto se ha descontado. 0 = ninguno (o el código no valía). */
      descuento: number;
      /** `false` con un código que el servidor no pudo aplicar. */
      codigoAplicado: boolean;
    }
  | { ok: false; error: string; sesionCaducada?: boolean };

/** Lo que dice el servidor de un código ANTES de pagar. */
export type ComprobacionCodigo =
  | { ok: true; descuento: number }
  | { ok: false; motivo: string };

/**
 * Comprueba un código con el servidor.
 *
 * ⚠️ Se manda el `socioId`: sin él, el servidor da por hecho que quien pregunta
 * es una clienta nueva, y un código «solo para nuevas» se confirmaría con
 * descuento a una socia de siempre… a la que luego se le cobraría el precio
 * entero. La regla la aplica el servidor con la misma función que el cobro.
 */
export async function comprobarCodigo(
  studioId: string, codigo: string, subtotal: number, socioId: string | null,
): Promise<ComprobacionCodigo> {
  try {
    const res = await fetch('/api/public/validar-codigo-descuento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
      body: JSON.stringify({ studioId, codigo, subtotal, socioId }),
    });
    const cuerpo = (await res.json().catch(() => null)) as { ok?: boolean; descuento?: number; motivo?: string } | null;
    if (cuerpo?.ok && typeof cuerpo.descuento === 'number') return { ok: true, descuento: cuerpo.descuento };
    // El motivo del servidor es el bueno: distingue «no existe» de «caducado»,
    // «agotado» o «solo para clientas nuevas», y ese matiz es justo lo que
    // evita que lo intente otras cinco veces.
    return { ok: false, motivo: cuerpo?.motivo ?? 'No hemos podido comprobar el código.' };
  } catch {
    return { ok: false, motivo: 'No hemos podido comprobar el código. Revisa tu conexión.' };
  }
}

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
  /** El código que la alumna ha escrito, si escribió alguno. */
  codigoDescuento?: string | null,
): Promise<InicioCobro> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch('/api/public/checkout-embebido', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      // Solo identificadores y el TEXTO del código. Ni el importe ni el
      // descuento viajan desde aquí: los dos los resuelve el servidor.
      body: JSON.stringify({ studioId, planId, socioId, codigoDescuento: codigoDescuento || undefined }),
    });

    if (res.status === 401) {
      return { ok: false, sesionCaducada: true, error: 'Tu sesión ha caducado. Vuelve a entrar y no se te ha cobrado nada.' };
    }

    const cuerpo = (await res.json().catch(() => null)) as {
      clientSecret?: string; error?: string;
      importe?: number; descuento?: number; codigoAplicado?: boolean;
    } | null;

    if (!res.ok) {
      // El texto del servidor es el bueno: distingue «plan no disponible» de
      // «el estudio no tiene Stripe conectado», y ese matiz importa.
      return { ok: false, error: cuerpo?.error ?? 'No hemos podido iniciar el pago. Inténtalo de nuevo.' };
    }
    if (!cuerpo?.clientSecret) {
      return { ok: false, error: 'No hemos podido iniciar el pago. No se te ha cobrado nada.' };
    }
    return {
      ok: true,
      clientSecret: cuerpo.clientSecret,
      // Si un servidor viejo no los manda, se cae al precio del plan: es lo
      // que se enseñaba antes, así que no empeora nada.
      importe: typeof cuerpo.importe === 'number' ? cuerpo.importe : NaN,
      descuento: typeof cuerpo.descuento === 'number' ? cuerpo.descuento : 0,
      codigoAplicado: cuerpo.codigoAplicado === true,
    };
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

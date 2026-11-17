import { NextRequest, NextResponse } from 'next/server';
import { errorInterno } from '@/lib/errores-servidor';
import { addonDePriceId, planDePriceId, priceIdDe, priceIdDeAddon } from '@/lib/billing/billing';
import { claveCheckoutLock, liberarCheckoutLock, reclamarCheckoutLock } from '@/lib/billing/checkout-lock';
import { itemsParaPasarAAnual, MENSAJE_SIN_CAMBIOS } from '@/lib/billing/mi-suscripcion/reglas';
import { accionesDe, cargarContexto, leerSuscripcion } from '@/lib/billing/mi-suscripcion/servidor';

export const dynamic = 'force-dynamic';

// Pasar de mensual a anual, AL MOMENTO y con el crédito del tiempo no usado. Solo esa dirección:
// pasar de anual a mensual (y bajar de plan) se programa para el final del periodo desde el portal
// de Stripe, sin cobro. La propietaria ya vio el importe en `/api/billing/vista-previa`.
//
// Dinero, mismo patrón que /api/billing/cambiar-plan: solo la propietaria, guardia de modo de
// Stripe, cerrojo contra el doble clic, decide con lo que dice STRIPE (no la fila) y después vuelve
// a LEERLO. `error_if_incomplete`: si el cobro no sale, el cambio NO se aplica (nada de quedarse a
// medias en impago).
export async function POST(req: NextRequest) {
  const c = await cargarContexto(req, 'billing-cambio-periodo', { max: 5, cobra: true });
  if (!c.ok) return c.respuesta;
  const { admin, stripe, studioId, subscriptionId, esCadena } = c.ctx;

  const body = await req.json().catch(() => null) as { a?: unknown } | null;
  if (body?.a !== 'anual') return NextResponse.json({ error: 'Desde aquí solo se puede pasar a pago anual. Para lo demás, usa «Facturas, tarjeta y cambio de plan».' }, { status: 400 });

  const claveLock = claveCheckoutLock('studio', studioId);
  if (!(await reclamarCheckoutLock(admin, claveLock))) {
    return NextResponse.json({ error: 'Ya hay un cambio de tu suscripción en marcha. Espera unos segundos.' }, { status: 409 });
  }
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const acciones = accionesDe(leerSuscripcion(sub), esCadena);
    if (!acciones.cambiarAAnual) {
      const motivo = acciones.motivoSinCambios;
      return NextResponse.json(
        { error: motivo ? MENSAJE_SIN_CAMBIOS[motivo] : 'Tu suscripción ya se paga por años.', codigo: motivo ?? 'ya-lo-tiene' }, { status: 409 },
      );
    }
    const items = itemsParaPasarAAnual(sub.items.data.map((l) => ({ id: l.id, priceId: l.price?.id })), {
      plan: planDePriceId, addon: addonDePriceId,
      precioAnualPlan: (p) => priceIdDe(p, 'anual'), precioAnualAddon: (a) => priceIdDeAddon(a, 'anual'),
    });
    if (!items) {
      return NextResponse.json({ error: 'Tu suscripción tiene algo que no esperábamos. Escríbenos y te cambiamos de plan a mano.', codigo: 'revisar' }, { status: 409 });
    }

    await stripe.subscriptions.update(subscriptionId, {
      items, proration_behavior: 'create_prorations', payment_behavior: 'error_if_incomplete',
    });

    // Lo que hay AHORA en Stripe, no lo que creemos haber hecho.
    const despues = leerSuscripcion(await stripe.subscriptions.retrieve(subscriptionId));
    if (despues.intervalo !== 'anual' || (despues.estado !== 'active' && despues.estado !== 'trialing')) {
      return NextResponse.json({ error: 'No se ha podido completar el cambio. Revisa tu suscripción en unos segundos.' }, { status: 409 });
    }
    return NextResponse.json({ ok: true, intervalo: 'anual' });
  } catch (err) {
    // Un cobro rechazado llega aquí (`error_if_incomplete`): el cambio no se ha aplicado.
    const rechazo = (err as { type?: string; code?: string }) ?? {};
    if (rechazo.type === 'StripeCardError' || rechazo.code === 'payment_intent_payment_attempt_failed' || rechazo.code === 'subscription_payment_intent_requires_action') {
      return NextResponse.json({ error: 'No hemos podido cobrar el año por adelantado, así que no se ha cambiado nada. Actualiza la tarjeta e inténtalo de nuevo.', codigo: 'cobro-rechazado' }, { status: 402 });
    }
    return errorInterno('billing/cambio-periodo:POST', err, 'No se ha podido confirmar el cambio. Recarga la página en unos segundos para ver cómo ha quedado.');
  } finally {
    await liberarCheckoutLock(admin, claveLock);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { errorInterno } from '@/lib/errores-servidor';
import { claveCheckoutLock, liberarCheckoutLock, reclamarCheckoutLock } from '@/lib/billing/checkout-lock';
import { cambiarAAnual, type StripeMinimo } from '@/lib/billing/mi-suscripcion/operaciones';
import { cargarContexto } from '@/lib/billing/mi-suscripcion/servidor';

export const dynamic = 'force-dynamic';

// Pasar de mensual a anual, AL MOMENTO y con el crédito del tiempo no usado. Solo esa dirección:
// pasar de anual a mensual (y bajar de plan) se programa para el final del periodo desde el portal
// de Stripe, sin cobro. La propietaria ya vio el importe en `/api/billing/vista-previa`.
//
// Dinero, mismo patrón que /api/billing/cambiar-plan: solo la propietaria, guardia de modo de
// Stripe, cerrojo contra el doble clic, decide con lo que dice STRIPE (no la fila) y después vuelve
// a LEERLO. `error_if_incomplete`: si el cobro no sale, el cambio NO se aplica (nada de quedarse a
// medias en impago). La lógica vive en `lib/billing/mi-suscripcion/operaciones.ts`, probada con un
// Stripe falso.
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
    const r = await cambiarAAnual(stripe as unknown as StripeMinimo, { subscriptionId, esCadena });
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    return errorInterno('billing/cambio-periodo:POST', err, 'No se ha podido confirmar el cambio. Recarga la página en unos segundos para ver cómo ha quedado.');
  } finally {
    await liberarCheckoutLock(admin, claveLock);
  }
}

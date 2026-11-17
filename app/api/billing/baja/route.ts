import { NextRequest, NextResponse } from 'next/server';
import { errorInterno } from '@/lib/errores-servidor';
import { claveCheckoutLock, liberarCheckoutLock, reclamarCheckoutLock } from '@/lib/billing/checkout-lock';
import { cambiarBaja, type StripeMinimo } from '@/lib/billing/mi-suscripcion/operaciones';
import { cargarContexto } from '@/lib/billing/mi-suscripcion/servidor';

export const dynamic = 'force-dynamic';

// Cancelar y reactivar, los dos del lado de Stripe y sin tocar dinero:
//   · `programar`: la baja se aplica AL FINAL del periodo ya pagado (`cancel_at_period_end`). Hasta
//     entonces el acceso sigue entero: no se quita ningún derecho antes de que corresponda.
//   · `reactivar`: quita la baja programada. Sin cobro (el periodo ya estaba pagado).
// El estado de nuestra fila lo sigue el webhook; la lógica (y la relectura de Stripe para confirmar)
// vive en `lib/billing/mi-suscripcion/operaciones.ts`, probada con un Stripe falso.
export async function POST(req: NextRequest) {
  const c = await cargarContexto(req, 'billing-baja', { max: 5, cobra: false });
  if (!c.ok) return c.respuesta;
  const { admin, stripe, studioId, subscriptionId, esCadena } = c.ctx;

  const body = await req.json().catch(() => null) as { accion?: unknown; motivo?: unknown } | null;
  const accion = body?.accion;
  if (accion !== 'programar' && accion !== 'reactivar') return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 });
  const motivo = typeof body?.motivo === 'string' ? body.motivo.trim().slice(0, 300) : '';

  const claveLock = claveCheckoutLock('studio', studioId);
  if (!(await reclamarCheckoutLock(admin, claveLock))) {
    return NextResponse.json({ error: 'Ya hay un cambio de tu suscripción en marcha. Espera unos segundos.' }, { status: 409 });
  }
  try {
    const r = await cambiarBaja(stripe as unknown as StripeMinimo, { subscriptionId, esCadena, accion, motivo });
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    return errorInterno('billing/baja:POST', err, 'No se ha podido confirmar el cambio. Recarga la página en unos segundos para ver cómo ha quedado.');
  } finally {
    await liberarCheckoutLock(admin, claveLock);
  }
}

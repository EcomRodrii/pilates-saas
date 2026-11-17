import { NextRequest, NextResponse } from 'next/server';
import { errorInterno } from '@/lib/errores-servidor';
import { claveCheckoutLock, liberarCheckoutLock, reclamarCheckoutLock } from '@/lib/billing/checkout-lock';
import { accionesDe, cargarContexto, isoDe, leerSuscripcion } from '@/lib/billing/mi-suscripcion/servidor';

export const dynamic = 'force-dynamic';

// Cancelar y reactivar, los dos del lado de Stripe y sin tocar dinero:
//   · `programar`: la baja se aplica AL FINAL del periodo ya pagado (`cancel_at_period_end`). Hasta
//     entonces el acceso sigue entero: no se quita ningún derecho antes de que corresponda.
//   · `reactivar`: quita la baja programada. Sin cobro (el periodo ya estaba pagado).
// El estado de nuestra fila lo sigue el webhook; aquí se vuelve a leer Stripe para confirmar.
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
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const acciones = accionesDe(leerSuscripcion(sub), esCadena);
    if (accion === 'programar' && !acciones.cancelar) {
      return NextResponse.json({ error: esCadena ? 'Tu sede va con el plan Cadena: la baja se gestiona desde la sede principal.' : 'Tu suscripción ya tiene la baja programada o no está activa.', codigo: 'no-aplica' }, { status: 409 });
    }
    if (accion === 'reactivar' && !acciones.reactivar) {
      return NextResponse.json({ error: 'Tu suscripción no tiene ninguna baja programada.', codigo: 'no-aplica' }, { status: 409 });
    }

    await stripe.subscriptions.update(
      subscriptionId,
      accion === 'programar'
        ? { cancel_at_period_end: true, ...(motivo ? { cancellation_details: { comment: motivo } } : {}) }
        // `cancel_at: ''` borra una baja puesta con fecha concreta (desde el portal o el dashboard).
        : { cancel_at_period_end: false, ...(sub.cancel_at ? { cancel_at: '' as unknown as null } : {}) },
    );

    const despues = leerSuscripcion(await stripe.subscriptions.retrieve(subscriptionId));
    if (despues.bajaProgramada !== (accion === 'programar')) {
      return NextResponse.json({ error: 'No se ha podido completar el cambio. Revisa tu suscripción en unos segundos.' }, { status: 409 });
    }
    return NextResponse.json({ ok: true, bajaProgramada: despues.bajaProgramada, accesoHasta: isoDe(despues.bajaEl) });
  } catch (err) {
    return errorInterno('billing/baja:POST', err, 'No se ha podido confirmar el cambio. Recarga la página en unos segundos para ver cómo ha quedado.');
  } finally {
    await liberarCheckoutLock(admin, claveLock);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { errorInterno } from '@/lib/errores-servidor';
import { estadoVisible, MENSAJE_SIN_CAMBIOS, TEXTO_ESTADO } from '@/lib/billing/mi-suscripcion/reglas';
import { accionesDe, cargarContexto, isoDe, leerSuscripcion } from '@/lib/billing/mi-suscripcion/servidor';

export const dynamic = 'force-dynamic';

// «Mi suscripción»: todo lo que la propietaria ve de lo que paga a Tentare, leído de STRIPE (la
// fuente de verdad) en cada visita: plan, importe, periodo, próxima renovación, método de pago,
// estado, facturas descargables y qué puede hacer. Una lectura por visita a esa pantalla.
export async function GET(req: NextRequest) {
  const c = await cargarContexto(req, 'billing-mi-suscripcion', { max: 30, cobra: false });
  if (!c.ok) return c.respuesta;
  const { stripe, subscriptionId, customerId, esCadena } = c.ctx;

  try {
    const [sub, cliente, facturas] = await Promise.all([
      stripe.subscriptions.retrieve(subscriptionId, { expand: ['default_payment_method'] }),
      stripe.customers.retrieve(customerId, { expand: ['invoice_settings.default_payment_method'] }),
      stripe.invoices.list({ customer: customerId, limit: 24 }),
    ]);
    const lectura = leerSuscripcion(sub);
    const acciones = accionesDe(lectura, esCadena);
    const visible = estadoVisible(lectura.estado, lectura.bajaProgramada);

    // La tarjeta de la suscripción, o la predeterminada del cliente.
    const pm = (typeof sub.default_payment_method === 'object' ? sub.default_payment_method : null)
      ?? (!('deleted' in cliente) && typeof cliente.invoice_settings?.default_payment_method === 'object'
        ? cliente.invoice_settings.default_payment_method as Stripe.PaymentMethod : null);
    const metodoPago = pm?.card
      ? { tipo: 'tarjeta' as const, marca: pm.card.brand, ultimos4: pm.card.last4, caduca: `${String(pm.card.exp_month).padStart(2, '0')}/${String(pm.card.exp_year).slice(-2)}` }
      : pm?.sepa_debit
        ? { tipo: 'sepa' as const, marca: 'SEPA', ultimos4: pm.sepa_debit.last4 ?? '', caduca: null }
        : null;

    return NextResponse.json({
      plan: lectura.plan,
      complementos: lectura.addons,
      intervalo: lectura.intervalo,
      importePeriodoCents: lectura.importePeriodoCents,
      moneda: lectura.moneda,
      proximaRenovacion: lectura.bajaProgramada ? null : isoDe(lectura.finPeriodoUnix),
      accesoHasta: isoDe(lectura.bajaEl),
      estado: visible,
      estadoTexto: TEXTO_ESTADO[visible],
      esCadena,
      metodoPago,
      acciones: { ...acciones, motivoSinCambios: undefined },
      mensajeSinCambios: acciones.motivoSinCambios ? MENSAJE_SIN_CAMBIOS[acciones.motivoSinCambios] : null,
      facturas: facturas.data
        .filter((f) => f.status && f.status !== 'draft')
        .map((f) => ({
          id: f.id as string,
          numero: f.number ?? null,
          fecha: isoDe(f.created),
          importeCents: f.total,
          estado: f.status as string,
          moneda: (f.currency ?? 'eur').toLowerCase(),
          urlFactura: f.hosted_invoice_url ?? null,
          urlPdf: f.invoice_pdf ?? null,
        })),
    });
  } catch (err) {
    return errorInterno('billing/mi-suscripcion:GET', err, 'No se ha podido leer tu suscripción. Vuelve a intentarlo en unos segundos.');
  }
}

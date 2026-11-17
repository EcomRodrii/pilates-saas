import { NextRequest, NextResponse } from 'next/server';
import { errorInterno } from '@/lib/errores-servidor';
import { vistaPrevia, type StripeMinimo } from '@/lib/billing/mi-suscripcion/operaciones';
import { cargarContexto } from '@/lib/billing/mi-suscripcion/servidor';

export const dynamic = 'force-dynamic';

// «Qué voy a pagar y cuándo», ANTES de tocar nada: la factura previa que calcula Stripe para el
// cambio (no una cuenta nuestra: el prorrateo es de Stripe). No escribe ni cobra nada.
//   · `anual`: pasar de mensual a anual. Se cobra EN EL ACTO, con el crédito del tiempo no usado.
//   · `estudio`: subir de Founding a Estudio. La parte proporcional se suma a la PRÓXIMA factura.
// La lógica vive en `lib/billing/mi-suscripcion/operaciones.ts`, probada con un Stripe falso.
export async function POST(req: NextRequest) {
  const c = await cargarContexto(req, 'billing-vista-previa', { max: 20, cobra: false });
  if (!c.ok) return c.respuesta;
  const { stripe, subscriptionId, customerId, esCadena } = c.ctx;

  const body = await req.json().catch(() => null) as { cambio?: unknown } | null;
  const cambio = body?.cambio;
  if (cambio !== 'anual' && cambio !== 'estudio') return NextResponse.json({ error: 'Cambio no válido.' }, { status: 400 });

  try {
    const r = await vistaPrevia(stripe as unknown as StripeMinimo, { subscriptionId, customerId, esCadena, cambio });
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    return errorInterno('billing/vista-previa:POST', err, 'No se ha podido calcular lo que pagarías. Vuelve a intentarlo en unos segundos.');
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { errorInterno } from '@/lib/errores-servidor';
import { addonDePriceId, planDePriceId, priceIdDe, priceIdDeAddon } from '@/lib/billing/billing';
import { itemsParaPasarAEstudio } from '@/lib/billing/cambio-plan-reglas';
import { itemsParaPasarAAnual, MENSAJE_SIN_CAMBIOS, resumenDeVistaPrevia } from '@/lib/billing/mi-suscripcion/reglas';
import { accionesDe, cargarContexto, isoDe, leerSuscripcion } from '@/lib/billing/mi-suscripcion/servidor';

export const dynamic = 'force-dynamic';

// «Qué voy a pagar y cuándo», ANTES de tocar nada: la factura previa que calcula Stripe para el
// cambio (no una cuenta nuestra: el prorrateo es de Stripe). No escribe ni cobra nada.
//   · `anual`: pasar de mensual a anual. Se cobra EN EL ACTO, con el crédito del tiempo no usado.
//   · `estudio`: subir de Founding a Estudio. La parte proporcional se suma a la PRÓXIMA factura.
export async function POST(req: NextRequest) {
  const c = await cargarContexto(req, 'billing-vista-previa', { max: 20, cobra: false });
  if (!c.ok) return c.respuesta;
  const { stripe, subscriptionId, customerId, esCadena } = c.ctx;

  const body = await req.json().catch(() => null) as { cambio?: unknown } | null;
  const cambio = body?.cambio;
  if (cambio !== 'anual' && cambio !== 'estudio') return NextResponse.json({ error: 'Cambio no válido.' }, { status: 400 });

  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const lectura = leerSuscripcion(sub);
    const acciones = accionesDe(lectura, esCadena);
    if (acciones.motivoSinCambios && acciones.motivoSinCambios !== 'anual-no-disponible') {
      return NextResponse.json({ error: MENSAJE_SIN_CAMBIOS[acciones.motivoSinCambios], codigo: acciones.motivoSinCambios }, { status: 409 });
    }
    const lineas = sub.items.data.map((l) => ({ id: l.id, priceId: l.price?.id }));

    let items;
    if (cambio === 'anual') {
      if (!acciones.cambiarAAnual) return NextResponse.json({ error: 'No se puede pasar a anual ahora mismo.' }, { status: 409 });
      items = itemsParaPasarAAnual(lineas, {
        plan: planDePriceId, addon: addonDePriceId,
        precioAnualPlan: (p) => priceIdDe(p, 'anual'), precioAnualAddon: (a) => priceIdDeAddon(a, 'anual'),
      });
    } else {
      if (!acciones.pasarAEstudio) return NextResponse.json({ error: 'No se puede pasar a Estudio ahora mismo.' }, { status: 409 });
      const precioEstudio = priceIdDe('ESTUDIO', lectura.intervalo);
      items = precioEstudio ? itemsParaPasarAEstudio(lineas, precioEstudio, { plan: planDePriceId, esAddon: (p) => !!addonDePriceId(p) }) : null;
    }
    if (!items) return NextResponse.json({ error: 'Tu suscripción tiene algo que no esperábamos. Escríbenos y te cambiamos de plan a mano.', codigo: 'revisar' }, { status: 409 });

    const previa = await stripe.invoices.createPreview({
      customer: customerId,
      subscription: subscriptionId,
      subscription_details: { items, proration_behavior: 'create_prorations' },
    });
    const fin = isoDe(lectura.finPeriodoUnix);
    return NextResponse.json(resumenDeVistaPrevia(previa, cambio === 'anual' ? 'ahora' : 'proxima_factura', fin));
  } catch (err) {
    return errorInterno('billing/vista-previa:POST', err, 'No se ha podido calcular lo que pagarías. Vuelve a intentarlo en unos segundos.');
  }
}

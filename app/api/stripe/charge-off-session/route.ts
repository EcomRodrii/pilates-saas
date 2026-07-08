import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabase } from '@/lib/supabase';
import { dbUpdateRecibo, dbUpdateAutomationLog } from '@/lib/supabase-data';
import { verificarSesionStaff } from '@/lib/auth-server';

// Cobra un recibo pendiente usando la tarjeta ya guardada de la socia, sin
// que ella tenga que hacer nada. Solo se llama cuando alguien del estudio
// aprueba la propuesta de cobro con un toque desde Automatizaciones — nunca
// se dispara en automático sin esa aprobación humana explícita.
export async function POST(req: NextRequest) {
  // SEGURIDAD: solo staff autenticado, y solo puede cobrar recibos de SU estudio.
  // Sin esto, cualquiera podía cargar una tarjeta guardada pasando IDs.
  const sesion = await verificarSesionStaff(req);
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return NextResponse.json({ error: 'Stripe no configurado' }, { status: 503 });
  }
  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });

  const body = await req.json() as { logId: string; reciboId: string; socioId: string; studioId: string };

  if (body.studioId !== sesion.studioId) {
    return NextResponse.json({ error: 'No autorizado para este estudio' }, { status: 403 });
  }

  const [{ data: recibo, error: reciboError }, { data: socio, error: socioError }, { data: studio, error: studioError }] = await Promise.all([
    supabase.from('recibos').select('*').eq('id', body.reciboId).single(),
    supabase.from('socios').select('*').eq('id', body.socioId).single(),
    supabase.from('studios').select('stripe_account_id').eq('id', body.studioId).single(),
  ]);

  if (reciboError || !recibo) {
    return NextResponse.json({ error: 'Recibo no encontrado' }, { status: 404 });
  }
  if (recibo.estado !== 'PENDIENTE') {
    return NextResponse.json({ error: 'Este recibo ya no está pendiente' }, { status: 409 });
  }
  if (socioError || !socio?.stripe_customer_id || !socio?.stripe_payment_method_id) {
    return NextResponse.json({ error: 'La socia no tiene tarjeta guardada' }, { status: 409 });
  }
  if (studioError || !studio?.stripe_account_id) {
    return NextResponse.json({ error: 'El estudio no tiene Stripe conectado' }, { status: 409 });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(recibo.importe * 100),
      currency: 'eur',
      customer: socio.stripe_customer_id,
      payment_method: socio.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      metadata: { reciboId: body.reciboId, socioId: body.socioId },
    }, { stripeAccount: studio.stripe_account_id });

    if (paymentIntent.status === 'succeeded') {
      await dbUpdateRecibo(body.reciboId, { estado: 'COBRADO', fechaCobro: new Date().toISOString() });
      await dbUpdateAutomationLog(body.logId, {
        resultado: 'EJECUTADO',
        detalle: `Cobro de ${recibo.importe}€ aprobado y cobrado con la tarjeta guardada.`,
      });
      return NextResponse.json({ ok: true, status: paymentIntent.status });
    }

    // requires_action u otro estado no terminal: la tarjeta necesita
    // autenticación (3DS) que no se puede completar sin la socia presente.
    await dbUpdateAutomationLog(body.logId, {
      resultado: 'FALLIDO',
      detalle: `El banco pidió autenticación adicional (3DS) que no se puede completar sin la socia presente. Pídele que pague desde un enlace de cobro normal.`,
    });
    return NextResponse.json({ ok: false, status: paymentIntent.status }, { status: 402 });
  } catch (err) {
    const mensaje = err instanceof Stripe.errors.StripeError
      ? err.message
      : (err instanceof Error ? err.message : 'Error desconocido al cobrar');
    await dbUpdateAutomationLog(body.logId, { resultado: 'FALLIDO', detalle: mensaje });
    return NextResponse.json({ error: mensaje }, { status: 402 });
  }
}

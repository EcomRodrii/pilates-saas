import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/rate-limit-core';
import { captchaDeServidorListo, verificarCaptcha } from '@/lib/auth/captcha-servidor';
import { CAMPO_TRAMPA, cayoEnLaTrampa } from '@/lib/auth/trampa-bots';
import { comprobarModoStripe } from '@/lib/billing/modo-stripe';
import { applicationFeeAmount } from '@/lib/billing/stripe-fees';
import { bloqueoPorSuscripcion } from '@/lib/billing/billing-guard';
import { paginaCerradaParaPeticion } from '@/lib/publico/pagina-cerrada-peticion';
import { errorInterno } from '@/lib/errores-servidor';
import { estudioDeSlug } from '@/lib/regalo/estudio-publico';
import { validarDatosRegalo, validarImporte } from '@/lib/regalo/reglas';
import { metadataDeRegalo, ORIGEN_REGALO } from '@/lib/regalo/sesion';

export const dynamic = 'force-dynamic';

// Compra de una tarjeta regalo por una persona SIN cuenta. Cobro por Stripe Checkout sobre
// la cuenta conectada del estudio (direct charge, como el resto de ventas).
//
// SEGURIDAD: el importe sale de lo que el estudio permite (`regalo_ajustes`), validado aquí;
// el cliente solo propone un número entero que debe caer en esa lista o rango. La tarjeta NO
// existe hasta que el webhook confirma el cobro (lib/regalo/stripe.ts): crear esta sesión no
// acuña nada. Orden: límites → trampa → validar → captcha de servidor → cobro.
export async function POST(req: NextRequest) {
  const limitado =
    (await enforceRateLimit(req, 'public-regalo-comprar', { max: 5, windowSeconds: 60 })) ??
    (await enforceRateLimit(req, 'public-regalo-comprar-dia', { max: 30, windowSeconds: 86_400 }));
  if (limitado) return limitado;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Petición no válida' }, { status: 400 });
  // Un bot que rellena el campo invisible recibe un «sí» mudo y no se crea nada.
  if (cayoEnLaTrampa(body[CAMPO_TRAMPA])) return NextResponse.json({ url: null });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) return NextResponse.json({ error: 'Los pagos no están disponibles ahora mismo.' }, { status: 503 });
  const modo = comprobarModoStripe();
  if (!modo.puedeCobrar) return NextResponse.json({ error: modo.motivo }, { status: 503 });

  const estudio = await estudioDeSlug(admin, body.slug);
  if (!estudio) return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });
  if (!estudio.ajustes.activo || !estudio.stripeAccountId) {
    return NextResponse.json({ error: 'Este estudio no vende tarjetas regalo por ahora.' }, { status: 409 });
  }
  const cerrada = await paginaCerradaParaPeticion(req, estudio.id);
  if (cerrada) return cerrada;
  const bloqueo = await bloqueoPorSuscripcion(estudio.id);
  if (bloqueo) return bloqueo;

  const importe = validarImporte(estudio.ajustes, body.importeEur);
  if (!importe.ok) return NextResponse.json({ error: importe.motivo }, { status: 400 });
  const datos = validarDatosRegalo(body);
  if (!datos.ok) return NextResponse.json({ error: datos.motivo }, { status: 400 });

  // Este endpoint manda un correo a una dirección que escribe un desconocido y mueve dinero:
  // el captcha se comprueba EN SERVIDOR, y sin clave configurada en un entorno desplegado se cierra.
  if (!captchaDeServidorListo()) return NextResponse.json({ error: 'La compra no está disponible ahora mismo.' }, { status: 503 });
  const token = typeof body.captchaToken === 'string' ? body.captchaToken : undefined;
  const captcha = await verificarCaptcha(token, { ip: clientIp(req) });
  if (captcha !== 'ok') {
    return NextResponse.json({ error: 'No hemos podido comprobar que no eres un robot. Vuelve a intentarlo.' }, { status: 400 });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_ENV ? null : 'http://localhost:3001');
  // Sin URL pública, la vuelta de Stripe iría a ninguna parte con el dinero ya cobrado: no se abre el pago.
  if (!base) return NextResponse.json({ error: 'La compra no está disponible ahora mismo.' }, { status: 503 });
  const ruta = `${base}/reservar/${estudio.slug}/regalo`;
  try {
    const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
    const fee = applicationFeeAmount(importe.centimos);
    const importeEur = importe.centimos / 100;
    const sesion = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        quantity: 1,
        price_data: { currency: 'eur', unit_amount: importe.centimos, product_data: { name: `Tarjeta regalo — ${estudio.nombre}` } },
      }],
      customer_email: datos.datos.compradorEmail,
      payment_intent_data: {
        ...(fee !== undefined ? { application_fee_amount: fee } : {}),
        // El handler de reembolsos y disputas lee la metadata del PAYMENT INTENT, no la de la sesión.
        metadata: { origen: ORIGEN_REGALO, studioId: estudio.id },
      },
      metadata: metadataDeRegalo({
        studioId: estudio.id, importeEur, caducidadMeses: estudio.ajustes.caducidadMeses, ...datos.datos,
      }),
      success_url: `${ruta}?gracias=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: ruta,
      locale: 'es',
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    }, { stripeAccount: estudio.stripeAccountId });
    if (!sesion.url) throw new Error('Stripe no devolvió URL de pago');
    return NextResponse.json({ url: sesion.url });
  } catch (err) {
    Sentry.captureException(err, { tags: { area: 'cobros', tipo: 'regalo-checkout' } });
    return errorInterno('public/regalo/comprar:POST', err, 'No hemos podido abrir el pago. Inténtalo de nuevo en un rato.');
  }
}

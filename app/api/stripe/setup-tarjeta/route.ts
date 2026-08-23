import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { comprobarModoStripe } from '@/lib/billing/modo-stripe';
import { autorizarSobreSocia } from '@/lib/billing/socia-autorizada';

// ─────────────────────────────────────────────────────────────────────────────
// Autorizar una TARJETA sin pagar nada (Checkout hosted en `mode: 'setup'`).
//
// El hueco que cierra: hasta ahora una tarjeta solo se guardaba de rebote, al
// pagar. Una socia que pagó por Bizum, por transferencia, en mostrador, o que
// viene importada de otra plataforma, no tenía NINGUNA forma de dejar una
// tarjeta autorizada — y "Cobrar online" en el panel solo podía responder "La
// socia no tiene tarjeta ni mandato SEPA guardado", sin salida. El portal de la
// alumna lo decía igual de claro y de inútil: "Se guarda sola la primera vez
// que compras un bono".
//
// Es el gemelo de /api/stripe/setup-sepa, y a propósito: mismo `mode: 'setup'`,
// misma cuenta conectada, mismo Customer reutilizado, y el webhook lo resuelve
// en la misma rama (`session.mode === 'setup'`) distinguiendo por
// `metadata.purpose`. No se construye ningún formulario de tarjeta propio:
// Stripe aloja la UI, el 3DS y el consentimiento, y nosotros no vemos nunca el
// número — requisito explícito ("nunca guardar datos sensibles de tarjeta
// directamente en nuestra base de datos").
//
// Semipúblico igual que setup-sepa: la socia abre el enlace sin sesión de
// staff. La defensa es validar que la socia pertenece a ese estudio; no mueve
// dinero, solo deja un método autorizado.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'stripe-setup-tarjeta', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return NextResponse.json({ error: 'Stripe no configurado' }, { status: 503 });
  }
  // Misma guarda de modo que las dos puertas por las que entra dinero: aquí no
  // se cobra, pero el método que se autorice se usará para cobrar, y una
  // tarjeta guardada en la cuenta equivocada es igual de inservible que un
  // cobro cruzado. Ver lib/billing/modo-stripe.ts.
  const modo = comprobarModoStripe();
  if (!modo.puedeCobrar) return NextResponse.json({ error: modo.motivo }, { status: 503 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });

  const body = (await req.json().catch(() => null)) as {
    studioId?: string;
    socioId?: string;
    slug?: string;
  } | null;

  if (!body?.studioId || !body?.socioId) {
    return NextResponse.json({ error: 'Falta el estudio o la socia' }, { status: 400 });
  }

  // Auditoría 22-ago: pertenecer al estudio NO basta. Sin esto, conocer un
  // `socioId` del estudio bastaba para abrir un Checkout de autorización y que
  // el webhook guardara el método de pago de QUIEN LLAMA sobre la ficha ajena
  // — secuestro del instrumento con el que se cobrará después. Fuente única en
  // lib/billing/socia-autorizada.ts: el gemelo la usa igual, que es el fallo
  // recurrente de este repo (arreglar un endpoint y no su hermano).
  //
  // Va ANTES de leer la ficha a propósito: hacerlo después convertía el 404
  // «Socia no encontrada» en un oráculo para enumerar ids del estudio.
  const permiso = await autorizarSobreSocia(req, body.studioId, body.socioId);
  if (!permiso.ok) {
    return NextResponse.json({ error: permiso.error }, { status: permiso.status });
  }

  const { data: socio, error: socioErr } = await admin
    .from('socios')
    .select('id, studio_id, nombre, email, stripe_customer_id')
    .eq('id', body.socioId)
    .maybeSingle();
  if (socioErr || !socio) {
    return NextResponse.json({ error: 'Socia no encontrada' }, { status: 404 });
  }
  if (socio.studio_id !== body.studioId) {
    return NextResponse.json({ error: 'Esa socia no pertenece a este estudio' }, { status: 403 });
  }

  const { data: studio } = await admin
    .from('studios')
    .select('stripe_account_id')
    .eq('id', body.studioId)
    .maybeSingle();
  if (!studio?.stripe_account_id) {
    return NextResponse.json({ error: 'El estudio no tiene Stripe conectado.' }, { status: 409 });
  }
  const stripeAccount = studio.stripe_account_id as string;

  try {
    // El método se adjunta a un Customer de la cuenta CONECTADA. Se reutiliza
    // el que ya haya (p. ej. si la socia pagó antes por Bizum ya existe uno):
    // crear un segundo dejaría la tarjeta colgando de un Customer distinto del
    // que usan los cobros off-session.
    let customerId = socio.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          name: (socio.nombre as string | null) ?? undefined,
          email: (socio.email as string | null) ?? undefined,
          metadata: { socioId: socio.id as string, studioId: body.studioId },
        },
        { stripeAccount },
      );
      customerId = customer.id;
      const { error: updErr } = await admin
        .from('socios').update({ stripe_customer_id: customerId })
        .eq('id', socio.id).eq('studio_id', body.studioId);
      if (updErr) {
        // Si no se persiste, el webhook lo volvería a resolver por su cuenta
        // (guarda `stripe_customer_id` de la sesión), pero un Customer que no
        // sabemos que existe se duplicaría en el siguiente intento. Mejor
        // pararlo aquí que ensuciar Stripe.
        console.error('[setup-tarjeta] no se pudo guardar el customer', updErr);
        return NextResponse.json({ error: 'No se pudo preparar el cliente de pago' }, { status: 500 });
      }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
    const base = body.slug
      ? `${appUrl}/portal/${encodeURIComponent(body.slug)}/compras`
      : `${appUrl}/pagos`;

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'setup',
        payment_method_types: ['card'],
        customer: customerId,
        // `purpose` es lo que el webhook usa para no confundir esto con el alta
        // de mandato SEPA, que comparte rama.
        metadata: { studioId: body.studioId, socioId: socio.id as string, purpose: 'tarjeta' },
        // `usage: 'off_session'` NO va aquí: `setup_intent_data` de Checkout solo
        // acepta description/metadata/on_behalf_of, y ponerlo era un error de
        // tipos. No se pierde nada — en `mode: 'setup'` Checkout ya crea el
        // SetupIntent con `usage=off_session`, que es justo lo que hace el método
        // utilizable para cobrar sin la socia delante. Mismo motivo por el que
        // /api/stripe/setup-sepa, que lleva tiempo funcionando, tampoco lo pasa.
        setup_intent_data: {
          metadata: { studioId: body.studioId, socioId: socio.id as string, purpose: 'tarjeta' },
        },
        success_url: `${base}?tarjeta=ok`,
        cancel_url: `${base}?tarjeta=cancel`,
        locale: 'es',
      },
      { stripeAccount },
    );

    return NextResponse.json({ url: session.url });
  } catch (err) {
    // El error técnico de Stripe (en inglés) no se le enseña a la socia.
    const raw = err instanceof Stripe.errors.StripeError ? err.message : String(err ?? '');
    console.error('[setup-tarjeta]', raw);
    return NextResponse.json(
      { error: 'No se ha podido abrir la página para guardar la tarjeta. Inténtalo de nuevo en un momento.' },
      { status: 400 },
    );
  }
}

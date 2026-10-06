import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { idDeTarjetaValido, tarjetaEsSuya, tarjetasVisibles, type PaymentMethodMin } from '@/lib/billing/tarjetas-guardadas';

const claveStripe = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  return key && !key.startsWith('sk_test_XXXX') ? key : null;
};

// ─────────────────────────────────────────────────────────────────────────────
// P16 (6-oct-2026): las tarjetas que la alumna aceptó GUARDAR al pagar en la app
// («Guárdala para la próxima»): las de su Customer en la cuenta del estudio con
// `allow_redisplay: 'always'`, más la de los cobros automáticos (`paraCobros`).
// Solo lectura. Si el Customer ya no existe en esa cuenta (el estudio reconectó
// Stripe), lista vacía.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-tarjeta-listar', { max: 30, windowSeconds: 60 });
  if (limited) return limited;
  const studioId = req.nextUrl.searchParams.get('studioId');
  if (!studioId) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const admin = getSupabaseAdmin();
  const key = claveStripe();
  if (!admin || !key) return NextResponse.json({ tarjetas: [] }, { headers: { 'Cache-Control': 'no-store' } });
  try {
    const [{ data: socio }, { data: studio }] = await Promise.all([
      admin.from('socios').select('stripe_customer_id, stripe_payment_method_id').eq('id', socioId).eq('studio_id', studioId).maybeSingle(),
      admin.from('studios').select('stripe_account_id').eq('id', studioId).maybeSingle(),
    ]);
    const customer = (socio?.stripe_customer_id as string | null) ?? null;
    const stripeAccount = (studio?.stripe_account_id as string | null) ?? null;
    if (!customer || !stripeAccount) return NextResponse.json({ tarjetas: [] }, { headers: { 'Cache-Control': 'no-store' } });
    const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
    let pms: PaymentMethodMin[] = [];
    try {
      const lista = await stripe.paymentMethods.list({ customer, type: 'card', limit: 20 }, { stripeAccount });
      pms = lista.data as unknown as PaymentMethodMin[];
    } catch (e) {
      if ((e as { code?: string })?.code !== 'resource_missing') throw e;
    }
    return NextResponse.json(
      { tarjetas: tarjetasVisibles(pms, (socio?.stripe_payment_method_id as string | null) ?? null) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return errorInterno('public/tarjeta:GET', err, 'No hemos podido cargar tus tarjetas.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Quitar la tarjeta guardada, desde el portal de la socia.
//
// El hueco que cierra: se podía GUARDAR una tarjeta (al pagar, o con
// /api/stripe/setup-tarjeta) y no había ninguna forma de quitarla. Ni desde el
// portal ni desde el panel: no hay un solo `paymentMethods.detach` en el repo.
// La socia veía sus cuatro últimos dígitos y un texto que le explicaba cómo se
// había guardado, sin salida.
//
// ⚠️ SEGURIDAD: la identidad sale del JWT verificado, nunca del body — mismo
// patrón que /api/public/favoritos y /api/public/reserva. Es lo que impide que
// nadie borre la tarjeta de otra socia sabiendo su id.
//
// Esto NO es el gemelo de `setup-tarjeta`, que es semipúblico a propósito
// (la socia abre su enlace sin sesión). Aquí sí hay sesión y sí se exige:
// guardar un método propio y BORRAR el de otra persona no son el mismo riesgo.
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-tarjeta-borrar', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { studioId?: string; paymentMethodId?: unknown } | null;
  if (!body?.studioId) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  // P16: con id, se quita ESA tarjeta (una guardada para pagar en la app). Sin id, la de cobros, como siempre.
  if (body.paymentMethodId !== undefined && !idDeTarjetaValido(body.paymentMethodId)) {
    return NextResponse.json({ error: 'Tarjeta no válida' }, { status: 400 });
  }
  const pmPedido = idDeTarjetaValido(body.paymentMethodId) ? body.paymentMethodId : null;

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, body.studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    const { data: socio } = await admin
      .from('socios')
      .select('id, stripe_payment_method_id, metodo_pago_preferido, sepa_payment_method_id, stripe_customer_id')
      .eq('id', socioId)
      .eq('studio_id', body.studioId)
      .maybeSingle();
    if (!socio) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const metodo = socio.stripe_payment_method_id as string | null;

    // P16: una tarjeta guardada para pagar en la app que NO es la de cobros. Solo si es de SU Customer
    // (403 si no): se suelta en Stripe y, si Stripe falla, se dice y la tarjeta sigue en la lista.
    if (pmPedido && pmPedido !== metodo) {
      const key = claveStripe();
      const { data: studio } = await admin.from('studios').select('stripe_account_id').eq('id', body.studioId).maybeSingle();
      const stripeAccount = studio?.stripe_account_id as string | undefined;
      if (!key || !stripeAccount) return NextResponse.json({ error: 'No se ha podido quitar la tarjeta.' }, { status: 503 });
      const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
      let pm: Stripe.PaymentMethod;
      try {
        pm = await stripe.paymentMethods.retrieve(pmPedido, {}, { stripeAccount });
      } catch (e) {
        // Ya no existe: para ella ya no está, que es lo que pidió.
        if ((e as { code?: string })?.code === 'resource_missing') return NextResponse.json({ ok: true, yaNoEstaba: true });
        throw e;
      }
      if (!tarjetaEsSuya(pm.customer, (socio.stripe_customer_id as string | null) ?? null)) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
      }
      try {
        await stripe.paymentMethods.detach(pmPedido, {}, { stripeAccount });
      } catch (e) {
        console.error('[public/tarjeta] no se pudo soltar la tarjeta guardada', e);
        return NextResponse.json({ error: 'No se ha podido quitar la tarjeta. Inténtalo de nuevo.' }, { status: 502 });
      }
      return NextResponse.json({ ok: true });
    }

    // ⚠️ Se limpia la BASE aunque Stripe falle, y no al revés. El orden importa:
    // si se borrase primero en Stripe y luego fallara la escritura, quedaría una
    // tarjeta que el portal enseña y que ya no se puede cobrar — el peor de los
    // dos estados. Al revés, lo que queda es un método huérfano en Stripe que no
    // usa nadie, y eso no le cobra nada a nadie.
    const limpieza: Record<string, unknown> = {
      stripe_payment_method_id: null,
      tarjeta_marca: null,
      tarjeta_ultimos4: null,
      tarjeta_exp_mes: null,
      tarjeta_exp_anio: null,
    };
    // Si su método preferido ERA la tarjeta, deja de serlo. Dejarlo apuntando a
    // una tarjeta que ya no existe haría que el cobro fallara con un motivo que
    // no se entiende, en vez de decir claramente que no hay método.
    if (socio.metodo_pago_preferido === 'TARJETA') {
      limpieza.metodo_pago_preferido = socio.sepa_payment_method_id ? 'SEPA' : null;
    }
    const { error: updErr } = await admin
      .from('socios').update(limpieza).eq('id', socioId).eq('studio_id', body.studioId);
    if (updErr) {
      return NextResponse.json({ error: 'No se ha podido quitar la tarjeta.' }, { status: 500 });
    }

    // Y ahora, si se puede, se suelta también en Stripe. Un fallo aquí NO se le
    // cuenta a la socia como error: para ella la tarjeta ya no está, que es lo
    // que pidió. Se registra para poder limpiarlo.
    const key = process.env.STRIPE_SECRET_KEY;
    if (metodo && key && !key.startsWith('sk_test_XXXX')) {
      const { data: studio } = await admin
        .from('studios').select('stripe_account_id').eq('id', body.studioId).maybeSingle();
      const stripeAccount = studio?.stripe_account_id as string | undefined;
      if (stripeAccount) {
        try {
          const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
          await stripe.paymentMethods.detach(metodo, {}, { stripeAccount });
        } catch (err) {
          console.error('[public/tarjeta] no se pudo soltar en Stripe', err);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorInterno('public/tarjeta:DELETE', err, 'No se ha podido quitar la tarjeta.');
  }
}

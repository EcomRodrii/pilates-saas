import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

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

  const body = (await req.json().catch(() => null)) as { studioId?: string } | null;
  if (!body?.studioId) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, body.studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    const { data: socio } = await admin
      .from('socios')
      .select('id, stripe_payment_method_id, metodo_pago_preferido, sepa_payment_method_id')
      .eq('id', socioId)
      .eq('studio_id', body.studioId)
      .maybeSingle();
    if (!socio) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const metodo = socio.stripe_payment_method_id as string | null;

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

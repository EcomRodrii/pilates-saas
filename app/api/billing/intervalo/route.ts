import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { verificarSesionStaff } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { intervaloDePrice, planDePriceId } from '@/lib/billing/billing';
import { errorInterno } from '@/lib/errores-servidor';

// ¿Esta suscripción se cobra por meses o por años? Solo lo pregunta /suscripcion a
// la propietaria que ya paga, para decir «al mes» o «al año» con su importe. Se lee
// de Stripe (que es quien cobra) en vez de guardarlo en una columna que habría que
// mantener al día: es una lectura por visita a esa pantalla, no por cada carga del
// panel (`/api/billing/status` no la hace).
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'billing-intervalo', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const key = process.env.STRIPE_SECRET_KEY;
  const admin = getSupabaseAdmin();
  if (!key || key.startsWith('sk_test_XXXX') || !admin) return NextResponse.json({ intervalo: 'mensual' });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') return NextResponse.json({ error: 'Solo la propietaria puede ver la suscripción' }, { status: 403 });

  try {
    const { data: studio } = await admin.from('studios').select('subscription_id, cadena_id').eq('id', sesion.studioId).maybeSingle();
    let subId = (studio?.subscription_id as string | null) ?? null;
    // Una cadena paga con UNA suscripción que vive en `cadenas`, no en la sede.
    if (!subId && studio?.cadena_id) {
      const { data: cadena } = await admin.from('cadenas').select('subscription_id').eq('id', studio.cadena_id as string).maybeSingle();
      subId = (cadena?.subscription_id as string | null) ?? null;
    }
    if (!subId) return NextResponse.json({ intervalo: 'mensual' });
    const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
    const sub = await stripe.subscriptions.retrieve(subId);
    // El periodo lo marca la línea del PLAN, no un complemento.
    const linea = sub.items.data.find((l) => planDePriceId(l.price?.id)) ?? sub.items.data[0];
    return NextResponse.json({ intervalo: intervaloDePrice(linea?.price?.recurring) });
  } catch (err) {
    // La pantalla trata un fallo como «mensual» (lo de siempre): no es dinero.
    return errorInterno('billing/intervalo:GET', err, 'No se pudo leer el periodo de facturación.');
  }
}

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { verificarSesionStaff, verificarUsuarioSupabase } from '@/lib/auth-server';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';

// Comprobación PROACTIVA de si la cuenta Stripe Connect del estudio puede
// aceptar domiciliaciones SEPA — antes de ofrecer el botón "Domiciliar" en el
// portal (app/portal/[slug]/compras/page.tsx). Sin esto, la socia solo se
// enteraba de que SEPA no estaba activado al volver del Checkout con un
// error (ver el catch de setup-sepa/route.ts, que sigue ahí como red de
// seguridad si esta comprobación falla o queda desactualizada).
//
// ⚠️ Auditoría 2026-09-21: el comentario anterior decía «semipúblico como
// setup-sepa». No lo era: `setup-sepa` exige JWT (`autorizarSobreSocia`) y
// esta ruta no comprobaba NADA. Cualquier anónimo podía enumerar qué estudios
// tienen Stripe Connect conectado y, por cada petición, provocar un
// `accounts.retrieve` contra nuestra cuenta (el rate limit es fail-open por
// diseño, así que no era una barrera). No filtra PII —solo un booleano—, pero
// la comprobación cuesta lo mismo que el comentario que la excusaba.
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'stripe-sepa-disponible', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const studioId = req.nextUrl.searchParams.get('studioId');
  if (!studioId) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });

  // Staff del propio estudio, o socia de ese estudio. El estudio sale siempre
  // de la sesión, nunca del query string (mismo criterio que setup-sepa).
  const staff = await verificarSesionStaff(req);
  if (!staff || staff.studioId !== studioId) {
    const usuario = await verificarUsuarioSupabase(req);
    if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const suyo = await socioAutenticado(usuario.userId, studioId);
    if (!suyo) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const key = process.env.STRIPE_SECRET_KEY;
  const admin = getSupabaseAdmin();
  if (!key || key.startsWith('sk_test_XXXX') || !admin) {
    // Sin Stripe configurado no hay SEPA que ofrecer, pero tampoco es un error
    // del estudio: se responde "no disponible" en vez de un 503 que el portal
    // tendría que distinguir de un fallo real.
    return NextResponse.json({ disponible: false });
  }

  const { data: studio } = await admin
    .from('studios')
    .select('stripe_account_id')
    .eq('id', studioId)
    .maybeSingle();
  if (!studio?.stripe_account_id) return NextResponse.json({ disponible: false });

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
  try {
    const cuenta = await stripe.accounts.retrieve(studio.stripe_account_id);
    const disponible = cuenta.capabilities?.sepa_debit_payments === 'active';
    return NextResponse.json({ disponible });
  } catch {
    // Fail-open: un fallo de red/Stripe no debe ocultar una opción de pago
    // que sí funciona. Si de verdad no está activada, setup-sepa lo detecta
    // igualmente al intentarlo (red de seguridad ya existente).
    return NextResponse.json({ disponible: true });
  }
}

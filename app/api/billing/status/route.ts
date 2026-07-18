import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { priceIdDe } from '@/lib/billing/billing';
import { accesoProducto, PLANES } from '@/lib/billing/entitlements';

// Estado de suscripción del estudio para el cliente (gate de acceso + página de
// suscripción). Diseño a prueba de foot-guns: `bloqueado` solo es true cuando la
// enforcement está ACTIVADA (BILLING_ENFORCED=true) Y Stripe está configurado Y
// el estudio no tiene suscripción activa. Si Stripe no está listo, falla ABIERTO
// (nunca bloquea) — es imposible dejarte fuera de tu propio producto sin querer.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) {
    // Sin service-role no podemos leer el estado: fallo abierto, no bloqueamos.
    return NextResponse.json({ plan: 'BASE', subscriptionStatus: null, activo: true, bloqueado: false, configurado: false });
  }

  const { data: studio } = await admin
    .from('studios')
    .select('plan, subscription_status, current_period_end')
    .eq('id', sesion.studioId)
    .single();

  const subscriptionStatus = studio?.subscription_status ?? null;
  const plan = studio?.plan ?? 'BASE';
  const activo = accesoProducto({ subscriptionStatus });
  // En prueba: durante el trial, current_period_end de Stripe = fin de la prueba.
  const enPrueba = subscriptionStatus === 'trialing';
  const pruebaTermina = enPrueba ? (studio?.current_period_end ?? null) : null;

  const key = process.env.STRIPE_SECRET_KEY;
  const stripeListo = Boolean(key && !key.startsWith('sk_test_XXXX'));
  const preciosListos = PLANES.every((p) => priceIdDe(p));
  const configurado = stripeListo && preciosListos;
  const enforcement = process.env.BILLING_ENFORCED === 'true';

  // Solo bloqueamos si: enforcement ON + Stripe configurado + sin suscripción.
  const bloqueado = enforcement && configurado && !activo;

  return NextResponse.json({
    plan,
    subscriptionStatus,
    activo,
    configurado,
    esPropietaria: sesion.rol === 'PROPIETARIO',
    bloqueado,
    enPrueba,
    pruebaTermina,
  });
}

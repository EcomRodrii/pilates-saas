import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { priceIdDe } from '@/lib/billing/billing';
import { accesoProducto, PLANES } from '@/lib/billing/entitlements';
import { estadoTrial } from '@/lib/billing/trial';

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
    .select('plan, subscription_status, subscription_id, current_period_end, trial_ends_at')
    .eq('id', sesion.studioId)
    .single();

  const subscriptionStatus = studio?.subscription_status ?? null;
  const plan = studio?.plan ?? 'BASE';

  // ⚠️ El vencimiento de la prueba se DERIVA aquí, en cada petición, y no se
  // confía a que el barrido de pg_cron haya pasado ya. Este endpoint es el gate
  // real (de él sale `bloqueado`, y con él el redirect a /suscripcion): si
  // dependiera del reloj del cron, un estudio con la prueba agotada seguiría
  // entrando hasta el siguiente tic. Mismo criterio que las reglas de reserva:
  // la regla de negocio vive en la derivación, el cron solo pone la BD al día.
  const trial = estadoTrial({
    trialEndsAt: studio?.trial_ends_at ?? null,
    subscriptionStatus,
    subscriptionId: studio?.subscription_id ?? null,
  });

  // `&& !trial.agotada`: la columna puede seguir diciendo 'trialing' —que
  // `accesoProducto` da por bueno— durante los minutos que van desde que vence
  // la prueba hasta que el barrido la cierra.
  const activo = accesoProducto({ subscriptionStatus }) && !trial.agotada;
  const enPrueba = trial.enPrueba;
  // Durante la prueba local manda `trial_ends_at`; en la de Stripe,
  // `current_period_end` (que ahí ES el fin de la prueba).
  const pruebaTermina = enPrueba ? (trial.finaliza ?? studio?.current_period_end ?? null) : null;
  // Fuera de la prueba ese mismo campo es la fecha del PRÓXIMO COBRO. Ya se
  // leía de la BD y se tiraba: la pantalla de suscripción decía el plan y nada
  // más, así que la dueña no veía ni cuánto paga ni cuándo se le cobra. Es su
  // factura mensual.
  const periodoTermina = studio?.current_period_end ?? null;

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
    periodoTermina,
    // Estado completo de la prueba, ya derivado en servidor: la píldora del
    // panel pinta la fase y los días sin volver a calcular nada ni leer el
    // reloj del navegador (que puede ir desfasado, y con él la cuenta atrás).
    trial: { fase: trial.fase, diasRestantes: trial.diasRestantes, finaliza: trial.finaliza },
  });
}

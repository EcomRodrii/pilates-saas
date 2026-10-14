import { NextRequest, NextResponse, after } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { priceIdDe } from '@/lib/billing/billing';
import { accesoProducto, PLANES } from '@/lib/billing/entitlements';
import { estadoTrial } from '@/lib/billing/trial';
import { encendidaPara } from '@/lib/interruptor-por-estudio';
import {
  ESTADO_GRATIS, ESTADO_GRATIS_CERRADO, LIMITE_ALUMNAS, LIMITE_RESERVAS_MES, MARGEN_DIAS, esPlanGratis, planQueToca, type EstadoGratisApi,
} from '@/lib/billing/plan-gratis';
import { leerUsoGratis, refrescarUsoGratis } from '@/lib/billing/uso-gratis-servidor';
import { COLUMNAS_PARA_GRATIS, cerrarPlanGratis, convertirAGratisSiToca, type FilaParaGratis } from '@/lib/billing/convertir-a-gratis';

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
    .select(`plan, current_period_end, trial_ends_at, owner_auth_user_id, ${COLUMNAS_PARA_GRATIS}`)
    .eq('id', sesion.studioId)
    .single();

  let subscriptionStatus = studio?.subscription_status ?? null;
  let plan = studio?.plan ?? 'BASE';

  // Founding Studio gratis (decisión del fundador, 15-oct-2026; reglas en
  // lib/billing/plan-gratis.ts), tras el interruptor FOUNDING_GRATIS: quien NO
  // paga pasa aquí a 'gratis'. Toda la lógica (Stripe, compare-and-set, nunca
  // una sede) vive en convertir-a-gratis.ts, la misma que usan los crons.
  if (studio && (await convertirAGratisSiToca(admin, studio as FilaParaGratis)) === 'convertido') {
    subscriptionStatus = ESTADO_GRATIS;
    plan = 'BASE';
  }
  // Un estudio gratis que está pagando Estudio y Stripe aún no lo confirma (3DS,
  // SEPA): el webhook escribe 'incomplete' encima de 'gratis'. Mientras dura, se
  // le trata como gratis (derivado, sin escribir nada): no se le cierra el panel
  // por estar pagando.
  const pagandoDesdeGratis = subscriptionStatus === 'incomplete' && !!studio && !studio.cadena_id
    && encendidaPara(process.env.FOUNDING_GRATIS, sesion.studioId);

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
  let activo = accesoProducto({ subscriptionStatus }) && !trial.agotada;
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
  let bloqueado = enforcement && configurado && !activo;

  // El plan gratis: se cierra el panel SOLO al acabar el margen tras pasarse de
  // un límite (y con la misma red de siempre: enforcement y Stripe listos, que
  // sin poder pagar no se encierra a nadie). Sin cifras, nunca se cierra.
  let gratis: EstadoGratisApi | null = null;
  if ((esPlanGratis(subscriptionStatus) || pagandoDesdeGratis) && studio) {
    const ahora = new Date();
    const lectura = await leerUsoGratis(admin, sesion.studioId, studio.owner_auth_user_id ?? null, ahora);
    if (lectura.caducado) {
      // Medir lee todas las reservas del grupo: después de contestar, nadie espera.
      after(async () => { await refrescarUsoGratis(admin, sesion.studioId, studio.owner_auth_user_id ?? null, new Date()); });
    }
    let estado = lectura.estado;
    // Ya cerrado en la base: cerrado, digan lo que digan las cifras.
    if (subscriptionStatus === ESTADO_GRATIS_CERRADO && estado.fase !== 'CERRADO') estado = { ...estado, fase: 'CERRADO', diasRestantes: 0, planQueToca: planQueToca(estado.uso) };
    // Acabado el margen: se escribe 'gratis_cerrado' para que TODO el servidor
    // (IA, Centro de Control, API pública…) lo vea, no solo esta pantalla.
    if (estado.fase === 'CERRADO' && subscriptionStatus === ESTADO_GRATIS && (await cerrarPlanGratis(admin, sesion.studioId))) {
      subscriptionStatus = ESTADO_GRATIS_CERRADO;
    }
    gratis = { ...estado, limites: { alumnas: LIMITE_ALUMNAS, reservasMes: LIMITE_RESERVAS_MES }, margenDias: MARGEN_DIAS };
    activo = estado.fase !== 'CERRADO';
    bloqueado = enforcement && configurado && !activo;
  }

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
    // Founding Studio gratis: el uso, la fase y el margen, ya derivados. `null` si no lo es.
    gratis,
  });
}

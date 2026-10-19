import { NextRequest, NextResponse, after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { priceIdDe } from '@/lib/billing/billing';
import { accesoProducto, PLANES } from '@/lib/billing/entitlements';
import { estadoTrial } from '@/lib/billing/trial';
import { encendidaPara } from '@/lib/interruptor-por-estudio';
import {
  ESTADO_GRATIS, ESTADO_GRATIS_CERRADO, LIMITE_ALUMNAS, LIMITE_RESERVAS_MES, MARGEN_DIAS, esPlanGratis, pagaPlan, sedeAdmiteGratis, type EstadoGratisApi,
} from '@/lib/billing/plan-gratis';
import { decidirPlanSuelto, type OpcionesDePlan } from '@/lib/billing/sede-incluida-en-cadena';
import { sueltosQueCancelaCadena, type SedeConPlan } from '@/lib/billing/cancelar-suscripcion-anterior';
import { leerUsoGratis, refrescarUsoGratis } from '@/lib/billing/uso-gratis-servidor';
import {
  COLUMNAS_PARA_GRATIS, cerrarPlanGratis, convertirAGratisSiToca, leerCadenaParaGratis, type FilaParaGratis,
} from '@/lib/billing/convertir-a-gratis';
import { marcarUso } from '@/lib/retencion/marcar-uso';
import { clientIp } from '@/lib/rate-limit-core';
import { COOKIE_DISPOSITIVO, huellaAltaActiva } from '@/lib/billing/vinculos-gratis';
import { apuntarHuellaAlta } from '@/lib/billing/vinculos-gratis-servidor';

/**
 * Las opciones de plan de un estudio que no paga. Uno suelto no lee nada más (le
 * basta su fila); una sede lee su cadena y sus hermanas. Lanza si una lectura falla.
 */
async function opcionesDePlan(admin: SupabaseClient, studio: SedeConPlan & { cadena_id: string | null }): Promise<OpcionesDePlan> {
  if (!studio.cadena_id) return { soloCadena: false, sueltosQueCancelaCadena: sueltosQueCancelaCadena([studio], studio.id) };
  const [cadena, sedes] = await Promise.all([
    leerCadenaParaGratis(admin, studio),
    admin.from('studios').select('id, nombre, plan, subscription_status, subscription_id, current_period_end').eq('cadena_id', studio.cadena_id),
  ]);
  if (sedes.error) throw new Error(`leer sedes: ${sedes.error.message}`);
  const decision = decidirPlanSuelto(cadena && { estado: cadena.subscriptionStatus, esPrincipal: cadena.esPrincipal });
  return {
    soloCadena: decision.accion === 'bloquear' && decision.motivo === 'solo-cadena',
    sueltosQueCancelaCadena: sueltosQueCancelaCadena((sedes.data ?? []) as SedeConPlan[], studio.id),
  };
}

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

  // Alguien del equipo ha abierto el panel: la señal de uso del estudio (una vez
  // al día, solo con BAJAS_AUTOMATICAS=informe). Después de contestar: nadie espera.
  after(() => marcarUso(admin, 'panel', sesion.studioId));

  const { data: studio } = await admin
    .from('studios')
    .select(`plan, current_period_end, trial_ends_at, owner_auth_user_id, ${COLUMNAS_PARA_GRATIS}`)
    .eq('id', sesion.studioId)
    .single();

  let subscriptionStatus = studio?.subscription_status ?? null;
  let plan = studio?.plan ?? 'BASE';

  // Founding Studio gratis (decisión del fundador, 15-oct-2026; reglas en
  // lib/billing/plan-gratis.ts), tras el interruptor FOUNDING_GRATIS: quien NO
  // paga pasa aquí a 'gratis'. Toda la lógica (Stripe, compare-and-set, de una
  // cadena solo la sede principal) vive en convertir-a-gratis.ts, la misma que
  // usan los crons.
  if (studio && (await convertirAGratisSiToca(admin, studio as FilaParaGratis)) === 'convertido') {
    subscriptionStatus = ESTADO_GRATIS;
    plan = 'BASE';
  }
  // Un estudio gratis que está pagando Estudio y Stripe aún no lo confirma (3DS,
  // SEPA): el webhook escribe 'incomplete' encima de 'gratis'. Mientras dura, se
  // le trata como gratis (derivado, sin escribir nada): no se le cierra el panel
  // por estar pagando. En una cadena, solo la sede principal con la cadena sin
  // pagar (la que estaba en el gratis): las demás siguen cerradas, y un pago de
  // Cadena a medias no las abre. Sin poder leer la cadena, no.
  let pagandoDesdeGratis = subscriptionStatus === 'incomplete' && !!studio
    && encendidaPara(process.env.FOUNDING_GRATIS, sesion.studioId);
  if (pagandoDesdeGratis && studio?.cadena_id) {
    const cadena = await leerCadenaParaGratis(admin, studio as FilaParaGratis).catch(() => null);
    pagandoDesdeGratis = sedeAdmiteGratis({ cadenaId: studio.cadena_id, cadena });
  }

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
    if (subscriptionStatus === ESTADO_GRATIS_CERRADO && estado.fase !== 'CERRADO') estado = { ...estado, fase: 'CERRADO', diasRestantes: 0 };
    // Acabado el margen: se escribe 'gratis_cerrado' para que TODO el servidor
    // (IA, Centro de Control, API pública…) lo vea, no solo esta pantalla.
    if (estado.fase === 'CERRADO' && subscriptionStatus === ESTADO_GRATIS && (await cerrarPlanGratis(admin, sesion.studioId))) {
      subscriptionStatus = ESTADO_GRATIS_CERRADO;
    }
    gratis = { ...estado, limites: { alumnas: LIMITE_ALUMNAS, reservasMes: LIMITE_RESERVAS_MES }, margenDias: MARGEN_DIAS };
    activo = estado.fase !== 'CERRADO';
    bloqueado = enforcement && configurado && !activo;
  }

  // /suscripcion ofrece planes solo a quien no paga (quien paga ve el portal), y
  // solo la propietaria contrata: solo entonces se lee. Así ni gerencia ni
  // recepción reciben el plan y la fecha de pago de las sedes hermanas, y el
  // resto de cargas del panel no pagan estas lecturas.
  // `null`: no se pudo leer; la pantalla avisa en condicional antes de Cadena.
  let opciones: OpcionesDePlan | null | undefined;
  if (studio && sesion.rol === 'PROPIETARIO' && !pagaPlan({ subscriptionStatus, subscriptionId: studio.subscription_id })) {
    opciones = await opcionesDePlan(admin, { ...studio, subscription_status: subscriptionStatus } as SedeConPlan & { cadena_id: string | null })
      .catch(() => null);
  }

  // La huella del alta (vinculos-gratis.ts), solo con HUELLA_ALTA y solo de la
  // propietaria: la primera IP y el primer navegador con que abre el panel. Solo
  // AVISA en /interno de un alta parecida a un estudio cerrado; nunca cierra nada.
  let dispositivoNuevo: string | null = null;
  if (huellaAltaActiva(process.env) && sesion.rol === 'PROPIETARIO') {
    const dispositivo = req.cookies.get(COOKIE_DISPOSITIVO)?.value ?? (dispositivoNuevo = crypto.randomUUID());
    const ip = clientIp(req);
    after(() => apuntarHuellaAlta(admin, sesion.studioId, ip === 'unknown' ? null : ip, dispositivo));
  }

  const respuesta = NextResponse.json({
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
    // Qué planes se le ofrecen y qué cancelaría Cadena. Ausente si ya paga.
    ...(opciones !== undefined ? { opcionesDePlan: opciones } : {}),
  });
  if (dispositivoNuevo) {
    respuesta.cookies.set(COOKIE_DISPOSITIVO, dispositivoNuevo, {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 400 * 24 * 3600,
    });
  }
  return respuesta;
}

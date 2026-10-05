import { sesionWidgetValida } from '@/lib/reservar/compra-en-embudo';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { applicationFeeAmount } from '@/lib/billing/stripe-fees';
import { comprobarModoStripe } from '@/lib/billing/modo-stripe';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { respuestaPreflightWidget, conCorsWidget } from '@/lib/cors-widget';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { comprobarVentanaReserva, socioAutenticado } from '@/lib/db/supabase-data-admin';
import { bloqueoPorPreguntasAlta } from '@/lib/db/preguntas-alta-admin';
import { claveCheckoutEmbebido } from '@/lib/billing/clave-checkout-embebido';
import {
  metadataVolatilEmbebida, parametrosClienteInvitada, parametrosPaymentIntentEmbebido, type DatosCompraEmbebida,
} from '@/lib/billing/pago-embebido-parametros';
import {
  claveTrasCobro, decidirPagoAnterior, mensajeClaseYaPagada, MENSAJE_PAGO_A_MEDIAS, MENSAJE_PAGO_SIN_COMPROBAR, queHacerConCobroRepetido,
} from '@/lib/billing/pago-anterior';
import { MENSAJE_COMPRA_YA_PAGADA } from '@/lib/billing/sesion-checkout';
import { idsDe } from '@/lib/billing/ids-compra';
import { piDeClientSecret } from '@/lib/billing/estado-pago-publico';
import { sesionNoExisteEnStripe } from '@/lib/billing/pago-online-al-cobrar-a-mano';
import { plazaDePICancelado } from '@/lib/billing/cupo-matricula-abandonado';
import { CODIGO_PAGO_EN_CURSO, esErrorDeIdempotencia, MENSAJE_PAGO_EN_CURSO } from '@/lib/billing/pago-en-curso';
import { setupFutureUsageCheckout } from '@/lib/billing/uso-futuro-tarjeta';
import { telefonoValido } from '@/lib/csv';
import type { TipoPlan } from '@/lib/types';
import { resolverDescuentoCheckout } from '@/lib/billing/descuento-checkout';
import { esSociaNueva } from '@/lib/billing/socia-nueva';
import { rechazoCompraPrueba } from '@/lib/billing/clase-prueba';
import { codigosYaUsadosPorSocia } from '@/lib/billing/codigos-ya-usados';
import { primeraVezConPlan, reservarMatricula, liberarCupoMatricula, liberarCupoMatriculaUnaVez, esRespuestaRepetida } from '@/lib/billing/matricula-online';
import {
  asignarRefPlaza, claveStripe, esEtapaAgotada, liberarPlazaPorRef, liberarPlazaSiEsDe, liberarPlazaSinCobro, MENSAJE_ETAPA_AGOTADA,
  recuperarPlazasCaducadas, reservarPlazaEtapa, type PlazaReservada,
} from '@/lib/opening/cupo';
import { mapCodigoDescuento } from '@/lib/supabase-data';
import type { RowCodigosDescuento } from '@/lib/db-types';
import { bloqueoPorSuscripcion } from '@/lib/billing/billing-guard';
import { paginaCerradaParaPeticion } from '@/lib/publico/pagina-cerrada-peticion';
import { cierreAperturaSuave, MENSAJE_APERTURA_SUAVE } from '@/lib/opening/apertura-suave';

// Fase 3 del "Booking Experience Engine" — checkout embebido dentro del widget
// (Modo B): sustituye `stripe.checkout.sessions.create()` (redirect de página
// completa) por un PaymentIntent que el cliente confirma en el propio Shadow
// Root con Stripe Elements (`@stripe/react-stripe-js`, componente aparte).
// Diseño completo: docs/checkout-embebido-diseno.md.
//
// SEGURIDAD: mismo criterio que app/api/stripe/checkout/route.ts (§1 del
// diseño) — el importe y el concepto SIEMPRE se leen del plan en servidor,
// NUNCA del body. Solo compra de PLAN (body.planId); el cobro de un recibo
// pendiente sigue viviendo en Checkout Session, sin tocar (§8 del diseño).
//
// CORS: el bundle embebible llama desde el dominio del ESTUDIO. El preflight
// no lleva body, así que ?studioId= o ?slug= tienen que ir en la query.
export async function OPTIONS(req: NextRequest) {
  return respuestaPreflightWidget(req);
}

// La clave de idempotencia vive en lib/billing/clave-checkout-embebido.ts —
// tiene su propia batería de tests, porque decide si dos intentos de pago son
// "el mismo" y eso es dinero.

// El error COMPLETO de Stripe para Sentry. El fallo del Customer de invitada
// se reproduce en producción al 100% con la clave correcta ya verificada por
// el fundador (restricted key descartada) — este capture ES el diagnóstico
// definitivo que falta, así que no basta el message: tipo, código, requestId
// y raw incluidos.
function detalleErrorStripe(e: unknown): Record<string, unknown> {
  const err = e as Partial<Stripe.errors.StripeError> & { requestId?: string; raw?: { message?: string; code?: string } };
  return {
    tipo: err?.type ?? null,
    codigo: err?.code ?? err?.raw?.code ?? null,
    mensaje: e instanceof Error ? e.message : String(e),
    rawMessage: err?.raw?.message ?? null,
    requestId: err?.requestId ?? null,
    statusCode: err?.statusCode ?? null,
  };
}

/** El cargo de este cobro está devuelto ENTERO (`latest_charge` expandido). */
function cargoDevueltoEntero(pi: Stripe.PaymentIntent | null): boolean {
  const cargo = pi?.latest_charge;
  return !!cargo && typeof cargo === 'object' && (cargo as Stripe.Charge).refunded === true;
}

/**
 * «Ya has pagado»: con lo que de verdad tiene (lib/billing/pago-anterior.ts,
 * `mensajeClaseYaPagada`), nunca una confirmación que no va a llegar. Quien pregunta
 * es la misma persona del mismo intento (la clave lleva quién paga), así que puede
 * saber qué pasó con SU pago.
 */
async function respuestaYaPagado(
  req: NextRequest, admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  pi: Stripe.PaymentIntent, studioId: string, conClase: boolean,
) {
  if (!conClase) {
    return conCorsWidget(req, NextResponse.json({ error: MENSAJE_COMPRA_YA_PAGADA, codigo: 'ya-pagado' }, { status: 409 }));
  }
  const ids = idsDe(pi.id);
  const [{ data: reserva }, { data: recibo }] = await Promise.all([
    admin.from('reservas').select('estado').eq('id', ids.reservaId).eq('studio_id', studioId).maybeSingle(),
    admin.from('recibos').select('id').eq('id', ids.reciboId).eq('studio_id', studioId).maybeSingle(),
  ]);
  const error = mensajeClaseYaPagada({
    cobro: pi.status === 'succeeded' ? 'cobrado' : 'procesando',
    entregado: !!recibo,
    reserva: (reserva?.estado as string | null | undefined) ?? null,
  });
  return conCorsWidget(req, NextResponse.json({ error, codigo: 'ya-pagado' }, { status: 409 }));
}

export async function POST(req: NextRequest) {
  // Bucket dedicado, no 'stripe-checkout': un checkout embebido tiene más idas
  // y vueltas por el mismo intento legítimo (crear intent → posible reintento
  // de 3DS → posible cambio de método sin recargar) que "un click, una
  // sesión". Ver §7 del diseño.
  const limited = await enforceRateLimit(req, 'checkout-embebido', { max: 15, windowSeconds: 120 });
  if (limited) return limited;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return conCorsWidget(req, NextResponse.json({ error: 'Stripe no configurado. Añade STRIPE_SECRET_KEY en .env.local' }, { status: 503 }));
  }
  // La sexta puerta por la que entra dinero. Ver lib/billing/modo-stripe.ts.
  const modo = comprobarModoStripe();
  if (!modo.puedeCobrar) {
    return conCorsWidget(req, NextResponse.json({ error: modo.motivo }, { status: 503 }));
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return conCorsWidget(req, NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 }));
  }

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });

  const body = await req.json().catch(() => null) as {
    studioId?: string;
    planId?: string;
    socioId?: string | null;
    socioEmail?: string | null;
    socioNombre?: string;
    // El teléfono que puso en el paso de datos — antes se validaba en el
    // cliente y se TIRABA: la ficha creada por el webhook quedaba sin él.
    socioTelefono?: string | null;
    origenLead?: string | null;
    /** Sesión del widget público (lib/reservar/eventos.ts), para el embudo. */
    widgetSesion?: string | null;
    // NUEVO — "pagar y reservar sin login previo" (docs/reserva-sin-login-diseno.md
    // §4.1): la clase que se quiere reservar en cuanto el pago se confirme.
    // Nunca decide el importe (siempre viene de plan.precio abajo) — solo
    // marca qué reservar después.
    sesionId?: string;
    // "Elige tu plaza" (diseño "Tentare Portal Reservas"): el sitio concreto de
    // la sala que la visitante escogió, si la sala tiene mapa de plazas. Nunca
    // decide el importe — solo viaja hasta reservar_plaza (p_spot_id) tras el
    // pago, con el mismo candado FOR UPDATE que ya usa el resto de la RPC.
    spotId?: string | null;
    // Auditoría vs Momence (#canje-codigos-descuento-checkout): mismo criterio
    // que app/api/stripe/checkout — texto tal cual, el servidor recalcula el
    // importe final.
    codigoDescuento?: string;
    // "Información adicional" del formulario de pago sin login — solo se
    // escriben al crear ficha NUEVA (ver CompraPlan.datosAdicionales). Nunca
    // deciden nada de negocio, son datos de perfil.
    genero?: string | null;
    comoConociste?: string | null;
    codigoPostal?: string | null;
    /** ISO `yyyy-mm-dd`. */
    fechaNacimiento?: string | null;
    // El client_secret del cobro que ESTA pantalla creó antes (volver atrás y
    // continuar). Si sigue pagable y es de esta persona, estudio y clase, se
    // cancela antes de crear el nuevo: un cobro por pantalla. Ver lib/billing/pago-anterior.ts.
    pagoAnterior?: string | null;
  } | null;

  if (!body?.studioId) {
    return conCorsWidget(req, NextResponse.json({ error: 'Falta el estudio' }, { status: 400 }));
  }
  // Con la página oculta no se compra ni se paga una clase desde fuera. Antes
  // de leer el plan y, sobre todo, antes de gastar una plaza de matrícula o
  // crear nada en Stripe.
  const cerrada = await paginaCerradaParaPeticion(req, body.studioId);
  if (cerrada) return conCorsWidget(req, cerrada);
  if (!body.planId) {
    return conCorsWidget(req, NextResponse.json({ error: 'Falta el plan a comprar' }, { status: 400 }));
  }

  // F-30 (auditoría 20ª pasada): la sexta puerta por la que entra dinero —
  // mismo guardia que ya protege charge-off-session, pos-bizum,
  // terminal/cobrar y reembolsos, que aquí faltaba (y en su gemela
  // /api/stripe/checkout). Sin él, un estudio con la suscripción a Tentare
  // caducada seguía cobrando a sus socias por el widget embebido.
  const bloqueo = await bloqueoPorSuscripcion(body.studioId);
  if (bloqueo) return conCorsWidget(req, bloqueo);

  // El email se valida AQUÍ, antes de que llegue a ningún sitio: sin socioId,
  // `entregarPlanComprado` busca la ficha con `.ilike('email', compra.email)`,
  // y en PostgREST `%` y `_` de `ilike` son COMODINES. Un `socioEmail` con
  // comodines que emparejara una sola fila haría que el bono —y con él la
  // tarjeta guardada— se asociaran a una socia ajena sin conocer su id. Mismo
  // patrón de validación que public/interes-lanzamiento y migracion-concierge.
  const EMAIL_RE = /^[^\s@%_]+@[^\s@%_]+\.[^\s@%_]+$/;
  if (body.socioEmail != null && !EMAIL_RE.test(body.socioEmail.trim())) {
    return conCorsWidget(req, NextResponse.json({ error: 'Email no válido' }, { status: 400 }));
  }
  // Normalizado UNA vez (sin espacios, en minúsculas) y el MISMO en la clave de
  // idempotencia y en los parámetros del cobro y del Customer (5-oct-2026). La clave
  // ya lo normalizaba y los parámetros no: otra pestaña con «Maria@…» en vez de
  // «maria@…» era el mismo intento con otros parámetros → `idempotency_error` → sin
  // poder pagar esa clase en 24 h.
  const socioEmail = typeof body.socioEmail === 'string' && body.socioEmail.trim()
    ? body.socioEmail.trim().toLowerCase()
    : null;
  // Teléfono: saneado pero NO bloqueante — a diferencia del email (que decide
  // a qué ficha se asocia el bono, y por eso 400ea), el teléfono es un dato de
  // contacto secundario: un formato raro no puede frenar un cobro legítimo.
  // Mismo criterio "aviso, no bloqueo" que telefonoValido documenta en el
  // importador. Inválido o ausente → simplemente no viaja.
  const telefonoCrudo = body.socioTelefono?.trim() ?? '';
  const socioTelefono = telefonoCrudo && telefonoCrudo.length <= 32 && telefonoValido(telefonoCrudo)
    ? telefonoCrudo
    : null;

  const { data: plan, error: errPlan } = await admin
    .from('planes_tarifa')
    .select('nombre, precio, tipo, studio_id, activo, matricula, es_prueba')
    .eq('id', body.planId)
    .maybeSingle();
  if (errPlan || !plan) {
    return conCorsWidget(req, NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 }));
  }
  if (plan.studio_id !== body.studioId) {
    return conCorsWidget(req, NextResponse.json({ error: 'Ese plan no pertenece a este estudio' }, { status: 403 }));
  }
  if (!plan.activo) {
    return conCorsWidget(req, NextResponse.json({ error: 'Ese plan ya no está disponible' }, { status: 409 }));
  }
  // ¿Este pago autoriza cargos futuros? Solo MENSUAL (renovación automática).
  // El CHECK de planes_tarifa garantiza que `tipo` es uno de los tres valores.
  const usoFuturo = setupFutureUsageCheckout(plan.tipo as TipoPlan);

  // ⚠️ El `socioId` NUNCA se toma del body.
  //
  // Antes era `body.socioId ?? null` sin comprobar nada: era el único endpoint
  // de app/api/public/** con service role que no derivaba la identidad del JWT.
  // Ese valor viaja por `metadata` hasta `entregarPlanComprado`, que lo usa tal
  // cual para insertar `suscripciones` y `recibos`, y hasta el webhook, que
  // escribe `stripe_customer_id`/`stripe_payment_method_id` sobre esa fila. Y
  // `suscripciones_socio_id_fkey` es una FK SIMPLE a `socios(id)`, no compuesta
  // con `studio_id` (verificado en producción), así que la BD tampoco lo
  // impedía. Resultado: pagando con tarjeta propia se podía escribir bono,
  // recibo y suscripción a nombre de otra socia —incluso de OTRO estudio— y,
  // peor, sobrescribir el método de pago guardado de una socia ajena, con lo
  // que los cobros off-session posteriores irían a la tarjeta del atacante.
  //
  // Los dos llamantes reales siguen funcionando igual:
  //  - widget con sesión (lib/widget/usar-datos-widget.ts → postPublicoWidget)
  //    manda el Bearer del portal, así que el socioId se deriva del token;
  //  - "pagar y reservar sin login" (app/reservar/[slug]/page.tsx) no manda
  //    socioId, solo email + sesionId → camino de invitada, intacto.
  let socioId: string | null = null;
  if (body.socioId) {
    const usuario = await verificarUsuarioSupabase(req);
    if (!usuario) {
      return conCorsWidget(req, NextResponse.json({ error: 'Inicia sesión para comprar.' }, { status: 401 }));
    }
    socioId = await socioAutenticado(usuario.userId, body.studioId);
    if (!socioId) {
      return conCorsWidget(req, NextResponse.json({ error: 'No autorizado' }, { status: 403 }));
    }
    // Con ficha: si el estudio pide sus preguntas y le falta alguna, no se cobra.
    // Sin ficha (invitada) no hay a quién preguntar: se le pedirán al entrar.
    const sinPreguntas = await bloqueoPorPreguntasAlta(body.studioId, socioId, 'comprar');
    if (sinPreguntas) return conCorsWidget(req, sinPreguntas);
  }
  // Comprar un plan sin ficha: decide el estudio (0110). En EXIGIR_REGISTRO no
  // se cobra a quien no se ha registrado — sin ficha no hay contrato aceptado,
  // así que cobrar antes sería cobrar sin consentimiento.
  //
  // EXCEPCIÓN deliberada, "pagar y reservar sin login previo"
  // (docs/reserva-sin-login-diseno.md §4.1/§8): con `sesionId`, esto YA NO es
  // "compra cualquier bono de forma anónima" (lo que `compra_publica_modo`
  // decide) — es "paga esta clase concreta", el flujo que el fundador pidió
  // que SIEMPRE esté disponible sin registro previo, sea cual sea el ajuste
  // del estudio. Mismo criterio de consentimiento diferido que ya usa
  // CREAR_FICHA: `entregarPlanComprado` crea la ficha SIN `aceptacionContrato`
  // a propósito, y el portal lo pide en la primera visita — no es una excepción
  // nueva al criterio de consentimiento, es el mismo camino que CREAR_FICHA ya
  // ofrecía, ahora incondicional para este caso concreto.
  if (!socioId && !body.sesionId) {
    const { data: cfg } = await admin
      .from('studios')
      .select('compra_publica_modo')
      .eq('id', body.studioId)
      .maybeSingle();
    if ((cfg?.compra_publica_modo ?? 'EXIGIR_REGISTRO') === 'EXIGIR_REGISTRO') {
      return conCorsWidget(req, NextResponse.json(
        { error: 'Regístrate antes de comprar: te pedimos el email y aceptar las condiciones.', necesitaRegistro: true },
        { status: 409 },
      ));
    }
  }

  // «Clase de prueba»: solo junto a una clase, nunca a 0 € por Stripe y solo
  // para quien la estrena (lib/billing/clase-prueba.ts, el mismo dueño que su
  // gemelo /api/stripe/checkout). Un plan normal no toca la base aquí.
  const rechazoPrueba = await rechazoCompraPrueba(admin, {
    studioId: body.studioId, plan: { es_prueba: plan.es_prueba, precio: plan.precio },
    socioId, email: socioEmail, sesionId: body.sesionId,
  });
  if (rechazoPrueba) {
    return conCorsWidget(req, NextResponse.json({ error: rechazoPrueba.error, codigo: rechazoPrueba.codigo }, { status: rechazoPrueba.status }));
  }

  let importe = Number(plan.precio);
  if (!(importe > 0)) {
    return conCorsWidget(req, NextResponse.json({ error: 'Importe no válido' }, { status: 409 }));
  }

  // Auditoría vs Momence: canje de código de descuento. Mismo criterio que
  // app/api/stripe/checkout — el servidor recalcula siempre, un código
  // inválido/caducado/agotado no bloquea la compra, solo se ignora.
  let codigoDescuentoId: string | null = null;
  // Cuánto se ha descontado, para poder DECÍRSELO a quien paga. Ver el
  // comentario de la respuesta, al final de esta función.
  let descuentoAplicado = 0;
  // Sin códigos sobre una prueba: ya es la oferta de bienvenida, no se apila otra.
  if (body.codigoDescuento && plan.es_prueba !== true) {
    const { data: codigosRaw } = await admin
      .from('codigos_descuento')
      .select('*')
      .eq('studio_id', body.studioId);
    const codigos = (codigosRaw ?? []).map(r => mapCodigoDescuento(r as RowCodigosDescuento));
    const resultado = resolverDescuentoCheckout(codigos, body.codigoDescuento, {
      hoyISO: new Date().toISOString(),
      subtotal: importe,
      esNueva: await esSociaNueva(admin, body.studioId, socioId, socioEmail),
      codigosYaUsados: await codigosYaUsadosPorSocia(admin, socioId),
    });
    if (resultado.ok) {
      descuentoAplicado = resultado.descuento;
      importe = Math.max(0, Math.round((importe - resultado.descuento) * 100) / 100);
      const codigoAplicado = codigos.find(c => c.codigo.trim().toUpperCase() === body.codigoDescuento!.trim().toUpperCase());
      codigoDescuentoId = codigoAplicado?.id ?? null;
    }
  }

  // P-1 (auditoría 26ª pasada): la matrícula se cobra la PRIMERA vez que esta
  // socia contrata un plan aquí — nunca sobre el código de descuento (ese es
  // del plan, no de esta venta aparte). Decidido AQUÍ, antes de cobrar.
  //
  // Desde la promoción de matrícula (cupo + fecha), el IMPORTE lo decide
  // `reservar_matricula` en la base, que además gasta la plaza bajo un
  // `for update`. Aquí solo se cobra lo que diga — igual que el Modo A, que es
  // justo el motivo de que la decisión viva en la BD y no en cada ruta.
  //
  // ⚠️ La plaza NO se reserva aquí: se reserva lo más tarde posible (justo
  // antes de crear el PaymentIntent), porque entre este punto y el cobro hay
  // seis validaciones que pueden abortar la compra —importe 0, sin email,
  // clase inexistente/cancelada/empezada, plan que no cubre el tipo, Stripe sin
  // conectar— y solo la primera devolvía la plaza. Las otras cinco la gastaban
  // para siempre: cuatro intentos fallidos agotaban «gratis para las 4
  // primeras» sin una sola venta.
  let matriculaCentimos = 0;
  let cupoMatriculaReservado: { planId: string; studioId: string } | null = null;
  const matriculaBase = Number(plan.matricula);

  // ⚠️ Auditoría 22ª pasada (3-sep-2026), D-11. El `importe > 0` de arriba se
  // comprueba ANTES del descuento, así que un código del 100 % dejaba llegar un
  // importe de 0 € a `paymentIntents.create` y Stripe lo rechazaba: la socia
  // veía un error interno genérico y el estudio no se enteraba de nada. Su
  // gemelo `app/api/stripe/checkout` ya lo valida DESPUÉS (línea 221); aquí
  // faltaba. Entregar gratis es otro camino (no pasa por Stripe) y no se
  // improvisa en un endpoint de cobro: se dice claro que ese código no sirve
  // para esta compra.
  if (!(importe > 0)) {
    return conCorsWidget(req, NextResponse.json(
      { error: 'Ese código deja la compra en 0 €. Pide a tu estudio que te dé el bono directamente.' },
      { status: 409 },
    ));
  }

  // "Pagar y reservar sin login previo" (docs/reserva-sin-login-diseno.md §4.1):
  // si viene sesionId, comprobar que la clase sigue viva y que el plan la
  // cubre ANTES de generar una intención de cobro — pagar por una clase que
  // ya no se puede reservar sería cobrar sin poder entregar nada.
  if (body.sesionId) {
    // Sin socioId (visitante nueva) hace falta email para poder crear la
    // ficha/cuenta después del pago — sin él, entregarPlanComprado no tiene a
    // quién entregarle nada (mismo motivo que 'sin-socia' en ese módulo).
    if (!socioId && !socioEmail) {
      return conCorsWidget(req, NextResponse.json({ error: 'Falta el email' }, { status: 400 }));
    }
    const { data: sesion } = await admin
      .from('sesiones').select('inicio, cancelada, tipo_clase_id')
      .eq('id', body.sesionId).eq('studio_id', body.studioId).maybeSingle();
    if (!sesion) return conCorsWidget(req, NextResponse.json({ error: 'Clase no encontrada' }, { status: 404 }));
    if (sesion.cancelada) return conCorsWidget(req, NextResponse.json({ error: 'Esta clase está cancelada' }, { status: 409 }));
    if (new Date(sesion.inicio as string).getTime() <= Date.now()) {
      return conCorsWidget(req, NextResponse.json({ error: 'Esta clase ya ha empezado' }, { status: 409 }));
    }
    const { data: tiposDelPlan } = await admin
      .from('plan_tipos_clase').select('tipo_clase_id').eq('plan_id', body.planId);
    // Sin filas = el plan cubre TODOS los tipos (mismo criterio que
    // hidratarTiposDePlanes/tieneEntitlementActivo en el resto del repo).
    if (tiposDelPlan && tiposDelPlan.length > 0 && !tiposDelPlan.some(t => t.tipo_clase_id === sesion.tipo_clase_id)) {
      return conCorsWidget(req, NextResponse.json({ error: 'Este plan no cubre el tipo de esta clase' }, { status: 400 }));
    }
    // Apertura suave: no se cobra una clase que luego no podría reservar. Si lo
    // que compra es un plan de etapa (fundadora…), con él entra en el grupo.
    const cierre = await cierreAperturaSuave(admin, body.studioId, socioId, sesion.inicio as string, { planQueCompra: body.planId });
    if (cierre) return conCorsWidget(req, NextResponse.json({ error: MENSAJE_APERTURA_SUAVE(cierre), codigo: 'apertura-suave' }, { status: 409 }));
    // La ventana de reserva (cierre y apertura, también a hora fija): cobrar una
    // clase que aún no se puede reservar —o que ya se cerró— era cobrar sin plaza,
    // porque la reserva tras el pago (`reservarPlazaTrasPagoPublico`) la rechaza.
    const ventana = await comprobarVentanaReserva(admin, { studioId: body.studioId, tipoClaseId: sesion.tipo_clase_id as string | null, inicioISO: sesion.inicio as string });
    if (ventana) return conCorsWidget(req, NextResponse.json({ error: ventana.error, codigo: ventana.codigo }, { status: 409 }));
  }

  const { data: studio } = await admin
    .from('studios')
    .select('stripe_account_id')
    .eq('id', body.studioId)
    .maybeSingle();
  if (!studio?.stripe_account_id) {
    return conCorsWidget(req, NextResponse.json({ error: 'Conecta tu cuenta de Stripe desde Configuración → Cobros y facturas antes de cobrar.' }, { status: 409 }));
  }
  const stripeAccount = studio.stripe_account_id;

  // El cobro que esta misma pantalla creó antes (5-oct-2026). Va ANTES de reservar
  // la matrícula y el cupo: si se cancela, lo que retenía vuelve y este intento lo
  // puede volver a usar. Solo se toca si quien lo manda tiene su client_secret y es
  // de este estudio, esta clase y esta persona (`decidirPagoAnterior`).
  let cobroSustituido: string | null = null;
  const secretoAnterior = typeof body.pagoAnterior === 'string' ? body.pagoAnterior : null;
  const piAnteriorId = piDeClientSecret(secretoAnterior);
  if (secretoAnterior && piAnteriorId) {
    let anterior: Stripe.PaymentIntent | null = null;
    try {
      anterior = await stripe.paymentIntents.retrieve(piAnteriorId, undefined, { stripeAccount });
    } catch (e) {
      if (!sesionNoExisteEnStripe(e)) {
        return conCorsWidget(req, NextResponse.json({ error: MENSAJE_PAGO_SIN_COMPROBAR }, { status: 503 }));
      }
    }
    const decision = anterior
      ? decidirPagoAnterior(anterior, secretoAnterior, { studioId: body.studioId, sesionId: body.sesionId ?? null, socioId, socioEmail })
      : 'ajeno';
    if (decision === 'pagado' && anterior) {
      return respuestaYaPagado(req, admin, anterior, body.studioId, !!body.sesionId);
    }
    if (decision === 'en-curso') {
      return conCorsWidget(req, NextResponse.json({ error: MENSAJE_PAGO_A_MEDIAS, codigo: CODIGO_PAGO_EN_CURSO }, { status: 409 }));
    }
    if (decision === 'ya-cancelado' && anterior) cobroSustituido = anterior.id;
    if (decision === 'cancelar' && anterior) {
      let cancelado: Stripe.PaymentIntent | null = null;
      try {
        cancelado = await stripe.paymentIntents.cancel(anterior.id, { cancellation_reason: 'requested_by_customer' }, {
          stripeAccount, idempotencyKey: `pago-anterior-cancelar-${anterior.id}`,
        });
      } catch {
        // Lo normal es que lo hayan pagado entre la consulta y aquí: se vuelve a mirar.
      }
      if (cancelado?.status !== 'canceled') {
        let ahora: Stripe.PaymentIntent | null = null;
        // Sin poder mirarlo, tampoco se crea otro (`ahora` se queda en null).
        try { ahora = await stripe.paymentIntents.retrieve(anterior.id, undefined, { stripeAccount }); } catch { ahora = null; }
        if (ahora?.status !== 'canceled') {
          if (ahora && queHacerConCobroRepetido(ahora.status) === 'pagado') {
            return respuestaYaPagado(req, admin, ahora, body.studioId, !!body.sesionId);
          }
          return conCorsWidget(req, NextResponse.json({ error: MENSAJE_PAGO_A_MEDIAS, codigo: CODIGO_PAGO_EN_CURSO }, { status: 409 }));
        }
        cancelado = ahora;
      }
      // Lo que retenía vuelve, con las mismas claves que el conciliador: una sola vez.
      await liberarPlazaPorRef(admin, cancelado.id);
      const matriculaRetenida = plazaDePICancelado(cancelado);
      if (matriculaRetenida) {
        try {
          await liberarCupoMatriculaUnaVez(admin, matriculaRetenida.clave, matriculaRetenida.planId, body.studioId);
        } catch (e) {
          // No ha quedado nada anotado: el conciliador la devuelve en su pasada (PI cancelado con la marca).
          Sentry.captureException(e instanceof Error ? e : new Error('liberar matrícula del pago anterior'), {
            level: 'warning', tags: { modulo: 'checkout-embebido', paso: 'pago-anterior' }, extra: { studioId: body.studioId, paymentIntentId: cancelado.id },
          });
        }
      }
      cobroSustituido = cancelado.id;
    }
  }

  // P-1 (auditoría 26ª pasada): la matrícula se cobra la PRIMERA vez que esta
  // socia contrata un plan aquí — nunca sobre el código de descuento (ese es
  // del plan, no de esta venta aparte). El IMPORTE lo decide `reservar_matricula`
  // en la base, que gasta la plaza bajo un `for update`; aquí solo se cobra lo
  // que diga. Es el último punto en que la compra puede fallar sin haber
  // gastado nada: de aquí en adelante, lo único que no crea el cobro es el
  // `catch` — que sí devuelve la plaza.
  if (matriculaBase > 0 && await primeraVezConPlan(admin, body.studioId, socioId, socioEmail)) {
    const aCobrar = await reservarMatricula(admin, body.planId, body.studioId, matriculaBase);
    matriculaCentimos = Math.round(aCobrar * 100);
    if (aCobrar === 0) cupoMatriculaReservado = { planId: body.planId, studioId: body.studioId };
  }
  // Base de idempotencia de ESTE intento — la reutiliza el PaymentIntent de
  // abajo. La creación del Customer usa un sufijo propio: Stripe scopea las
  // claves de idempotencia por cuenta y comprueba que los parámetros
  // coincidan, así que compartir la MISMA clave entre dos llamadas con forma
  // distinta (customers.create vs paymentIntents.create) rompería en el
  // segundo reintento legítimo del mismo intento.
  const idemKey = claveCheckoutEmbebido({
    studioId: body.studioId, planId: body.planId, socioId,
    socioEmail, sesionId: body.sesionId ?? null,
    codigoDescuentoId,
  });

  // Cupo EXACTO de una etapa «Cerrar la venta» (Opening OS): plaza reservada
  // bajo lock ANTES de crear nada en Stripe, con la clave de este intento. Un
  // PaymentIntent no caduca solo: si se abandona, la plaza vuelve cuando el
  // siguiente comprador la necesita y Stripe confirma que se puede cancelar
  // (recuperarPlazasCaducadas).
  let plaza: PlazaReservada | null = null;
  try {
    await recuperarPlazasCaducadas(admin, stripe, body.planId, body.studioId, stripeAccount);
    plaza = await reservarPlazaEtapa(admin, body.planId, body.studioId, idemKey);
  } catch (err) {
    if (cupoMatriculaReservado) {
      await liberarCupoMatricula(admin, cupoMatriculaReservado.planId, cupoMatriculaReservado.studioId);
    }
    if (esEtapaAgotada(err)) {
      return conCorsWidget(req, NextResponse.json({ error: MENSAJE_ETAPA_AGOTADA }, { status: 409 }));
    }
    return conCorsWidget(req, errorInterno('public/checkout-embebido:plaza', err, 'No se pudo iniciar el cobro. Inténtalo de nuevo.'));
  }

  // I-2 (auditoría 19-ago): el PaymentIntent se creaba con
  // `setup_future_usage: 'off_session'` pero SIN `customer` — Stripe crea el
  // Customer automáticamente en una Checkout Session, pero NO en un
  // PaymentIntent suelto como este. El webhook (`stripe webhook, rama
  // plan_web_embebido`) solo guarda la tarjeta si `typeof pi.customer ===
  // 'string'`, así que nunca guardaba nada: toda socia captada por este
  // camino se quedaba sin método de pago reutilizable, y "Cobrar online" y
  // las renovaciones automáticas fallaban después con "no tiene tarjeta ni
  // mandato SEPA". Mismo patrón que ya usa app/api/stripe/setup-tarjeta —
  // reutilizar el Customer si la socia ya tiene uno, crearlo si no.
  //
  // Fail-open a propósito: esto es una tarjeta GUARDABLE, no el cobro en sí.
  // Que Stripe falle al crear el Customer no debe bloquear el pago — se
  // pierde la posibilidad de guardar la tarjeta esta vez, no el cobro.
  let customerId: string | null = null;
  if (socioId) {
    const { data: socio } = await admin
      .from('socios').select('nombre, email, stripe_customer_id')
      .eq('id', socioId).eq('studio_id', body.studioId).maybeSingle();
    customerId = (socio?.stripe_customer_id as string | null) ?? null;
    if (!customerId) {
      try {
        const customer = await stripe.customers.create(
          {
            name: (socio?.nombre as string | null) ?? undefined,
            email: (socio?.email as string | null) ?? socioEmail ?? undefined,
            metadata: { socioId, studioId: body.studioId },
          },
          { stripeAccount, idempotencyKey: `${idemKey}:customer` },
        );
        customerId = customer.id;
        const { error: updErr } = await admin
          .from('socios').update({ stripe_customer_id: customerId })
          .eq('id', socioId).eq('studio_id', body.studioId);
        // Si no se persiste, un Customer que no sabemos que existe se
        // duplicaría en el siguiente intento — mismo motivo que setup-tarjeta
        // aborta aquí en vez de seguir con un id que se va a perder.
        if (updErr) {
          console.error('[checkout-embebido] no se pudo guardar el customer', updErr);
          customerId = null;
        }
      } catch (e) {
        // Fail-open en el COBRO, fail-visible en el error: en producción este
        // catch se comía en silencio el 100% de los fallos (2 PIs
        // inspeccionados con customer: null) y nadie se enteraba de que la
        // tarjeta nunca se guardaba. El pago sigue adelante igual.
        console.error('[checkout-embebido] no se pudo crear el customer de Stripe', e);
        Sentry.captureException(e instanceof Error ? e : new Error(String(e)), {
          tags: { modulo: 'checkout-embebido', paso: 'customer' },
          extra: { studioId: body.studioId, invitada: false, ...detalleErrorStripe(e) },
        });
        customerId = null;
      }
    }
  } else if (socioEmail) {
    // Camino de invitada (sin socioId todavía: la ficha la crea
    // entregarPlanComprado DESPUÉS del pago). No hay fila `socios` donde
    // persistir nada aquí — se crea el Customer igualmente y viaja en el
    // PaymentIntent; el webhook ya escribe `stripe_customer_id: pi.customer`
    // sobre la socia recién creada en la rama de guardado de tarjeta, así
    // que con `customer` presente en el PI ese camino empieza a funcionar
    // solo, sin tocar el webhook.
    //
    // Revisado a fondo buscando una causa estática del fallo del 100% en
    // producción (params, idempotencyKey, stripeAccount): no se encontró
    // ninguna. Un matiz relevante: Stripe REPLAYA durante ~24h el resultado
    // de una idempotencyKey aunque fuera un error, así que un primer fallo
    // se repetía en cada reintento del mismo intento con la clave vieja —
    // el `-v2` de la clave estrena espacio de claves limpio. Si el fallo
    // persiste, el capture de abajo (tipo/código/requestId) es el diagnóstico.
    try {
      // Solo lo que identifica el intento: el nombre y el teléfono se escriben
      // después. Con ellos aquí, corregirlos daba `idempotency_error` en el
      // Customer y el cobro salía distinto del primero (`-v3` estrena las claves
      // con estos parámetros).
      const customer = await stripe.customers.create(
        parametrosClienteInvitada({ socioEmail, studioId: body.studioId }),
        { stripeAccount, idempotencyKey: `${idemKey}:customer-v3` },
      );
      customerId = customer.id;
      const datosCliente = { ...(body.socioNombre ? { name: body.socioNombre } : {}), ...(socioTelefono ? { phone: socioTelefono } : {}) };
      if (Object.keys(datosCliente).length > 0) {
        // Best-effort: el cobro no depende de esto (el nombre y el teléfono de la
        // ficha viajan en la metadata del cobro).
        await stripe.customers.update(customer.id, datosCliente, { stripeAccount }).catch(err => {
          console.error('[checkout-embebido] no se pudo poner nombre/teléfono al customer', err instanceof Error ? err.message : err);
        });
      }
    } catch (e) {
      // Mismo criterio que arriba: seguir sin customer (el pago no se
      // bloquea), pero que el fallo se VEA. Este es el caso confirmado en
      // producción — hipótesis principal: restricted key sin Customers:write.
      console.error('[checkout-embebido] no se pudo crear el customer de Stripe (invitada)', e);
      Sentry.captureException(e instanceof Error ? e : new Error(String(e)), {
        tags: { modulo: 'checkout-embebido', paso: 'customer' },
        extra: { studioId: body.studioId, invitada: true, ...detalleErrorStripe(e) },
      });
    }
  }

  // P-1: el TOTAL cobrado incluye la matrícula, en el mismo cargo — un solo
  // PaymentIntent, nunca un segundo cobro aparte.
  const amountCentimos = Math.round(importe * 100) + matriculaCentimos;
  const fee = applicationFeeAmount(amountCentimos);

  // Qué condiciones estaban vigentes AHORA, cuando la clienta decide pagar.
  // El hash lo calcula el servidor desde los textos del estudio: si lo mandara
  // el navegador, la prueba de qué se aceptó vendría de la parte interesada.
  // Best-effort — si falla, la compra sigue sin sello (ver `legal-sellado.ts`).
  // CUÁNDO se aceptaron no viaja en el cobro: es `pi.created` (ver
  // lib/billing/sello-del-cobro.ts). Ninguno de los parámetros de abajo puede
  // depender del reloj: con la misma clave, Stripe exige que sean idénticos.
  const { sellarCondicionesVigentes } = await import('@/lib/legal-sellado');
  const sello = await sellarCondicionesVigentes(admin, body.studioId);
  const datosCompra: DatosCompraEmbebida = {
    studioId: body.studioId,
    planId: body.planId,
    planNombre: plan.nombre,
    terminosHash: sello?.hash ?? null,
    cupoMatriculaReservado: cupoMatriculaReservado !== null,
    plazaEtapaId: plaza?.id ?? null,
    socioId,
    socioEmail,
    socioNombre: body.socioNombre ?? null,
    socioTelefono,
    origenLead: body.origenLead ?? null,
    sesionId: body.sesionId ?? null,
    widgetSesion: sesionWidgetValida(body.widgetSesion),
    spotId: body.spotId ?? null,
    codigoDescuentoId,
    matriculaCentimos,
    genero: body.genero ?? null,
    comoConociste: body.comoConociste ?? null,
    codigoPostal: body.codigoPostal ?? null,
    fechaNacimiento: body.fechaNacimiento ?? null,
    amountCentimos,
    usoFuturo,
    customerId,
    fee,
  };
  // Solo lo ESTABLE del intento: lo que el formulario puede cambiar va después
  // (`metadataVolatilEmbebida`, por `update`). Ver lib/billing/pago-embebido-parametros.ts.
  const parametros = parametrosPaymentIntentEmbebido(datosCompra);
  // Mejora respecto al camino existente (Checkout Session no la lleva): dos
  // pestañas del mismo intento legítimo no generan dos PaymentIntents cobrables
  // — ver §1/§9.4 del diseño y `claveIdempotencia` arriba. Con plaza de cupo, la
  // clave lleva su intento: si su PaymentIntent se canceló al recuperar la plaza,
  // un nuevo intento necesita otro, no ese.
  //
  // ⚠️ La clave NO se deriva del pago anterior de esta pantalla (5-oct-2026): otra
  // pestaña del mismo intento, sin ese pago, usaba la clave a secas y creaba un
  // SEGUNDO cobro pagable (y con plaza de etapa soltaba la del cobro vivo). Todas
  // las pestañas usan la misma; si la ocupa el cobro cancelado, la repetición lo
  // dice y el camino 'nuevo' deriva la siguiente igual para todas.
  const claveBase = plaza ? claveStripe(idemKey, plaza.intento) : idemKey;
  const crearCobro = (clave: string) => stripe.paymentIntents.create(parametros, { stripeAccount, idempotencyKey: clave });
  // La plaza de matrícula gratis que reservó ESTA petición y que no va con ningún cobro.
  const devolverMatriculaPropia = async () => {
    if (cupoMatriculaReservado) await liberarCupoMatricula(admin, cupoMatriculaReservado.planId, cupoMatriculaReservado.studioId);
  };
  // La de un cobro que ya existe con la marca: con SU clave, la misma del conciliador,
  // que la vería otra vez en el PI cancelado. Sin clave se devolvía dos veces (−1 neto
  // por petición: la promoción no se agotaba nunca).
  const devolverMatriculaDe = async (cobroId: string) => {
    if (!cupoMatriculaReservado) return;
    try {
      await liberarCupoMatriculaUnaVez(admin, cobroId, cupoMatriculaReservado.planId, cupoMatriculaReservado.studioId);
    } catch (e) {
      // No ha quedado nada anotado: el conciliador la devuelve (PI cancelado con la marca).
      Sentry.captureException(e instanceof Error ? e : new Error('liberar matrícula del cobro cancelado'), {
        level: 'warning', tags: { modulo: 'checkout-embebido', paso: 'matricula' }, extra: { studioId: body.studioId, paymentIntentId: cobroId },
      });
    }
  };
  // Cancela un cobro y dice cómo ha quedado (null = no se ha podido ni mirar).
  const cancelarYMirar = async (id: string): Promise<Stripe.PaymentIntent | null> => {
    try {
      return await stripe.paymentIntents.cancel(id, { cancellation_reason: 'abandoned' }, { stripeAccount, idempotencyKey: `abandonado-cancelar-${id}` });
    } catch {
      try { return await stripe.paymentIntents.retrieve(id, undefined, { stripeAccount }); } catch { return null; }
    }
  };

  try {
    // El cobro de ESTE intento. Cada repetición de Stripe (la de la clave a secas y
    // la de cada clave derivada) se mira contra el cobro de AHORA: nunca se entrega
    // el client_secret de un cobro cancelado o ya cobrado sin su `retrieve`.
    let clave = claveBase;
    let probadaTrasSustituido = false;
    let paymentIntent: Stripe.PaymentIntent | null = null;
    let creadoAqui = false;
    let final: { tipo: 'pagado'; pi: Stripe.PaymentIntent } | { tipo: 'en-curso' } | { tipo: 'no-se-sabe' } = { tipo: 'no-se-sabe' };
    for (let vuelta = 0; vuelta < 4; vuelta++) {
      let pi: Stripe.PaymentIntent;
      try {
        pi = await crearCobro(clave);
      } catch (errCrear) {
        // La clave a secas la ocupa el cobro que ESTA pantalla acaba de cancelar, con
        // otro importe (la matrícula gratis se agotó, otro precio). Solo esta petición
        // sabe que está muerto, así que solo ella sigue con otra clave; las demás
        // pestañas reciben el 409 de abajo, nunca un segundo cobro.
        if (esErrorDeIdempotencia(errCrear) && cobroSustituido && !probadaTrasSustituido && clave === claveBase) {
          probadaTrasSustituido = true;
          clave = claveTrasCobro(claveBase, cobroSustituido);
          continue;
        }
        throw errCrear;
      }
      if (!esRespuestaRepetida(pi)) { paymentIntent = pi; creadoAqui = true; break; }
      // La repetición trae el cobro como era al CREARSE: se mira el de ahora.
      let actual: Stripe.PaymentIntent | null = null;
      try {
        actual = await stripe.paymentIntents.retrieve(pi.id, { expand: ['latest_charge'] }, { stripeAccount });
      } catch (errActual) {
        console.error('[checkout-embebido] no se pudo mirar el cobro repetido', pi.id, errActual);
      }
      const que = queHacerConCobroRepetido(actual?.status, {
        creadoEnSeg: actual?.created ?? null, ahora: new Date(), reembolsado: cargoDevueltoEntero(actual),
      });
      if (que === 'usar' && actual) { paymentIntent = actual; break; }
      // Cancelado, o devuelto entero: este mismo intento necesita otro, con una clave
      // que no lo repita (la misma para todas sus pestañas).
      if (que === 'nuevo') { clave = claveTrasCobro(clave, pi.id); continue; }
      // Un 3DS abandonado: se cancela y se sigue. Con plaza de etapa no: esa plaza es
      // la suya, y `recuperarPlazasCaducadas` cancela el cobro y la devuelve a su
      // plazo (como mucho media hora, lo que dice el texto).
      if (que === 'cancelar-y-nuevo' && actual && !plaza) {
        const tras = await cancelarYMirar(actual.id);
        if (tras?.status === 'canceled') {
          const retenida = plazaDePICancelado(tras);
          if (retenida) {
            try {
              await liberarCupoMatriculaUnaVez(admin, retenida.clave, retenida.planId, body.studioId);
            } catch (e) {
              Sentry.captureException(e instanceof Error ? e : new Error('liberar matrícula del 3DS abandonado'), {
                level: 'warning', tags: { modulo: 'checkout-embebido', paso: '3ds-abandonado' }, extra: { studioId: body.studioId, paymentIntentId: tras.id },
              });
            }
          }
          clave = claveTrasCobro(clave, pi.id);
          continue;
        }
        // No se dejó cancelar: lo normal es que se acabe de pagar.
        final = tras && queHacerConCobroRepetido(tras.status) === 'pagado' ? { tipo: 'pagado', pi: tras } : { tipo: 'en-curso' };
        break;
      }
      final = que === 'pagado' && actual
        ? { tipo: 'pagado', pi: actual }
        : que === 'en-curso' || que === 'cancelar-y-nuevo' ? { tipo: 'en-curso' } : { tipo: 'no-se-sabe' };
      break;
    }
    if (!paymentIntent) {
      // Cobrado, a medias o sin poder saberlo: ni su client_secret ni otro cobro. La
      // plaza de cupo es la de ese cobro (misma clave): no se suelta. La de matrícula
      // gratis la reservó esta petición para sí: vuelve.
      await devolverMatriculaPropia();
      if (final.tipo === 'pagado') return respuestaYaPagado(req, admin, final.pi, body.studioId, !!body.sesionId);
      return conCorsWidget(req, final.tipo === 'en-curso'
        ? NextResponse.json({ error: MENSAJE_PAGO_A_MEDIAS, codigo: CODIGO_PAGO_EN_CURSO }, { status: 409 })
        : NextResponse.json({ error: MENSAJE_PAGO_SIN_COMPROBAR }, { status: 503 }));
    }

    // La plaza queda ligada a ESTE cobro; si no se puede guardar, no habría
    // forma de confirmarla ni de soltarla: se cancela el cobro y se devuelve.
    // Un cobro que no creó esta petición no se cancela: es el de otra pestaña.
    if (plaza && !(await asignarRefPlaza(admin, plaza.id, paymentIntent.id))) {
      if (creadoAqui) {
        let cancelado = false;
        try {
          const c = await stripe.paymentIntents.cancel(paymentIntent.id, undefined, { stripeAccount, idempotencyKey: `plaza-cancelar-${paymentIntent.id}` });
          cancelado = c.status === 'canceled';
        } catch (errCancelar) {
          // Si no se puede cancelar, la plaza se queda reservada: mejor no vender
          // una de más. La recuperará la siguiente compra si Stripe lo confirma.
          console.error('[checkout-embebido] no se pudo cancelar el cobro sin plaza ligada', paymentIntent.id, errCancelar);
        }
        if (cancelado) {
          // Solo si no es de OTRO cobro: la de otra pestaña sigue pagable.
          await liberarPlazaSiEsDe(admin, plaza.id, paymentIntent.id);
          await devolverMatriculaDe(paymentIntent.id);
        }
        // Sin cancelar, el cobro sigue con su marca: lo cancela y la devuelve el conciliador.
      } else {
        await devolverMatriculaPropia();
      }
      return conCorsWidget(req, NextResponse.json({ error: 'No se pudo iniciar el cobro. Inténtalo de nuevo.' }, { status: 500 }));
    }

    // Mismo intento que ya creó este PaymentIntent (doble clic, dos pestañas):
    // Stripe devuelve el de antes y esta petición no ha creado nada, pero SÍ ha
    // reservado otra plaza de matrícula gratis, que no usará nadie. (Si el
    // repetido estaba cancelado y esta petición creó otro, la plaza va con él.)
    if (!creadoAqui) await devolverMatriculaPropia();

    // Lo que el formulario puede cambiar, DESPUÉS de crear: antes de devolver el
    // client_secret, así que nadie paga este cobro sin estos datos. En uno
    // compartido (otra pestaña del mismo intento) gana lo último que se escribe.
    const volatil = metadataVolatilEmbebida(datosCompra);
    if (Object.keys(volatil).length > 0) {
      try {
        await stripe.paymentIntents.update(paymentIntent.id, { metadata: volatil }, { stripeAccount });
      } catch (errDatos) {
        if (creadoAqui) {
          // Sin el nombre, el teléfono o el sitio, la ficha y la reserva saldrían
          // mal: este cobro no se entrega. Se cancela y se devuelve lo retenido,
          // con las claves de ESTE cobro: la plaza por su referencia y la matrícula
          // «una vez», las mismas que usaría el conciliador al verlo cancelado.
          try {
            const c = await stripe.paymentIntents.cancel(paymentIntent.id, undefined, { stripeAccount, idempotencyKey: `sin-datos-cancelar-${paymentIntent.id}` });
            if (c.status === 'canceled') {
              if (plaza) await liberarPlazaPorRef(admin, paymentIntent.id);
              await devolverMatriculaDe(paymentIntent.id);
            }
          } catch (errCancelar) {
            console.error('[checkout-embebido] no se pudo cancelar el cobro sin datos', paymentIntent.id, errCancelar);
          }
          return conCorsWidget(req, errorInterno('public/checkout-embebido:datos', errDatos, 'No se pudo iniciar el cobro. Inténtalo de nuevo.'));
        }
        // El de otra pestaña ya lleva los datos con los que se creó.
        Sentry.captureException(errDatos instanceof Error ? errDatos : new Error('actualizar datos del cobro'), {
          level: 'warning', tags: { modulo: 'checkout-embebido', paso: 'datos' }, extra: { studioId: body.studioId, paymentIntentId: paymentIntent.id },
        });
      }
    }

    // ⚠️ Se devuelve el IMPORTE, y no es un extra: es lo único que permite que
    // la pantalla enseñe lo que de verdad se va a cobrar.
    //
    // El total lo pintaba el cliente desde `plan.precio`, mientras el descuento
    // se resuelve AQUÍ. Con un código aplicado, la pantalla decía el precio
    // entero y Stripe cobraba menos; y como un código inválido «no bloquea la
    // compra, solo se ignora» (ver arriba), un código que dejara de valer entre
    // que se comprueba y se paga daba el desajuste contrario: pantalla con
    // descuento y cobro completo.
    //
    // Con el importe del servidor no hay aritmética en el cliente que pueda
    // divergir: se enseña el número con el que se ha creado el PaymentIntent.
    return conCorsWidget(req, NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      importe,
      descuento: descuentoAplicado,
      codigoAplicado: codigoDescuentoId !== null,
      // P-1: para que la pantalla pueda decir "Cuota X € + Matrícula Y €" en
      // vez de un total mudo — el desglose real, con el que se ha creado el
      // cobro, nunca una resta hecha en el cliente.
      matricula: matriculaCentimos / 100,
    }));
  } catch (err) {
    // Stripe ya tiene un cobro con ESTA clave y otros parámetros: el mismo intento
    // reabierto con datos distintos. Ese cobro sigue vivo y se puede pagar, y la
    // plaza de cupo es la SUYA (se reserva con la misma clave): soltarla vendía una
    // de más. Solo vuelve la plaza de matrícula gratis, que esta petición reservó
    // para sí sola. Ver lib/billing/pago-en-curso.ts.
    if (esErrorDeIdempotencia(err)) {
      await devolverMatriculaPropia();
      // La plaza de cupo solo si ningún cobro la tiene: si la etapa empezó entre las
      // dos peticiones, el cobro de antes no la lleva (ver lib/billing/pago-en-curso.ts).
      if (plaza) await liberarPlazaSinCobro(admin, plaza.id);
      Sentry.captureMessage('[checkout-embebido] el mismo intento de pago volvió con otros parámetros', {
        level: 'warning', tags: { modulo: 'checkout-embebido', tipo: 'pago-en-curso' },
        extra: { studioId: body.studioId, conClase: !!body.sesionId, conPlaza: !!plaza, ...detalleErrorStripe(err) },
      });
      return conCorsWidget(req, NextResponse.json({ error: MENSAJE_PAGO_EN_CURSO, codigo: CODIGO_PAGO_EN_CURSO }, { status: 409 }));
    }
    // Si el cobro no llegó a nacer, la plaza no se ha usado (si un cobro anterior ya
    // la tiene ligada, es suya y no se toca).
    if (plaza) await liberarPlazaSinCobro(admin, plaza.id);
    await devolverMatriculaPropia();
    return conCorsWidget(req, errorInterno('public/checkout-embebido:POST', err, 'No se pudo iniciar el cobro. Inténtalo de nuevo más tarde.'));
  }
}

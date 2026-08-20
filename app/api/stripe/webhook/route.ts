import { NextRequest, NextResponse, after } from 'next/server';
import Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { capturar } from '@/lib/analytics';
import { reclamarWebhookEvent, marcarWebhookProcesado, claveWebhook } from '@/lib/webhook-idempotencia';
import { aplicarRenovacionServidor } from '@/lib/billing/renovacion-server';
import { tenantAutorizado, cuentaFirmante } from '@/lib/billing/webhook-tenant';
import { guardarCaducidadTarjeta } from '@/lib/billing/caducidad-tarjeta';
import { metodoReutilizableDe } from '@/lib/billing/metodo-reutilizable';
import { registrarDevolucion, referenciaDevolucion, origenDeReembolso } from '@/lib/billing/registrar-devolucion';
import { registrarFalloCobro, confirmarCobroExitoso } from '@/lib/billing/dunning-server';
import { sellarFacturaDeRecibo } from '@/lib/billing/sellar-factura-server';

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

// Orígenes cuyo PaymentIntent apunta a un recibo real de Tentare, y que por
// tanto hay que marcar DEVUELTO/disputado cuando se devuelve o se impugna.
//
// ⚠️ Es una LISTA, no dos comparaciones sueltas, porque ya se olvidó una: al
// añadir la metadata a las compras de plan por enlace público (`plan_web`) se
// escribió el `reciboId` en el PaymentIntent pero NO se añadió el origen aquí,
// así que los tres consumidores lo seguían descartando y la compra continuaba
// siendo invisible a reembolsos y disputas — exactamente el agujero que ese
// cambio decía cerrar. Al añadir un origen nuevo, añadirlo también aquí.
const ORIGENES_CON_RECIBO = new Set(['sepa_recibo', 'tarjeta_recibo', 'plan_web', 'plan_web_embebido']);

// Id de NUESTRA propia cuenta de Stripe (la de la plataforma).
//
// Solo hace falta porque hay un estudio cuyo `stripe_account_id` ES esta misma
// cuenta —el de demostración, que resulta ser el único que ha cobrado de
// verdad—: Stripe entrega esos cobros como "de tu cuenta", sin `event.account`.
//
// Se AVERIGUA solo, con `GET /v1/account`, que devuelve la cuenta de la clave de
// API. La primera versión de esto lo exigía en una variable de entorno, y eso
// convertía el arreglo de un cobro perdido en una tarea de operaciones — se
// quedó bloqueado justo ahí. Un webhook de dinero no puede depender de que
// alguien acierte a rellenar una variable.
//
// Va por `fetch` y no por el SDK porque `accounts.retrieve` exige un id en los
// tipos de esta versión, y la sobrecarga sin argumentos no existe. La variable
// se sigue respetando si está puesta: sirve para fijar el valor y ahorrar la
// llamada.
//
// Cacheado por instancia, y SOLO en caso de éxito: si la llamada falla no
// queremos dejar la instancia con `null` hasta que la reciclen, porque `null`
// significa "sin tenant" → 403.
let cachePlataforma: string | undefined;
async function cuentaDePlataforma(): Promise<string | null> {
  if (cachePlataforma !== undefined) return cachePlataforma;
  const fijada = process.env.STRIPE_PLATFORM_ACCOUNT_ID;
  if (fijada) return (cachePlataforma = fijada);
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.stripe.com/v1/account', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const cuenta = await res.json() as { id?: string };
    return cuenta.id ? (cachePlataforma = cuenta.id) : null;
  } catch {
    return null;
  }
}

/**
 * Estudio dueño de la cuenta de Stripe que firma el evento.
 *
 * Es la ÚNICA fuente fiable del tenant en los eventos de recibo: la metadata del
 * PaymentIntent la controla quien lo crea, así que un estudio con acceso a su
 * propia cuenta Stripe podría poner ahí el reciboId de OTRO estudio y confirmar
 * (o devolver) un cobro ajeno. `event.account` lo pone Stripe, no el emisor.
 *
 * ⚠️ Este comentario decía que `event.account` "siempre viene informado" en
 * estos manejadores. NO es cierto, y costó un cobro sin entregar: cuando el
 * `stripe_account_id` del estudio es la propia cuenta de la plataforma, Stripe
 * trata el cargo como "de tu cuenta" y entrega el evento SIN `account`. De ahí
 * `cuentaFirmante`.
 */
async function studioDeCuentaConnect(
  admin: AdminClient,
  accountId: string | undefined,
): Promise<string | null> {
  // Un evento SIN `account` viene de la cuenta de la plataforma — que es la que
  // tiene configurada el estudio de demostración. Ver `cuentaFirmante`.
  //
  // La cuenta de la plataforma solo se pide SI hace falta: en un direct charge
  // normal `accountId` ya viene informado y nos ahorramos la llamada entera.
  const cuenta = cuentaFirmante(accountId, accountId ? null : await cuentaDePlataforma());
  if (!cuenta) return null;
  const { data } = await admin.from('studios').select('id').eq('stripe_account_id', cuenta).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export async function POST(req: NextRequest) {
  const key = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  // Los eventos de las cuentas conectadas (Stripe Connect) llegan a este mismo
  // endpoint pero firmados con un secreto de webhook distinto — el que
  // Stripe genera en el endpoint "Connect" del Dashboard, no el de la cuenta
  // de la plataforma.
  const connectWebhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return NextResponse.json({ error: 'Stripe no configurado' }, { status: 503 });
  }

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
  const body = await req.text();
  const sig = req.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret ?? '');
  } catch {
    try {
      event = stripe.webhooks.constructEvent(body, sig, connectWebhookSecret ?? '');
    } catch {
      return NextResponse.json({ error: 'Webhook signature inválida' }, { status: 400 });
    }
  }

  // M10: idempotencia por event.id — reclamación atómica (RPC): si este
  // evento ya se procesó con éxito o hay otra entrega en vuelo dentro de la
  // ventana de expiración, salimos sin reprocesar.
  // Acotada al ámbito 'connect': el webhook del SaaS comparte esta tabla y
  // recibe algunos de los mismos tipos de evento (ver lib/webhook-idempotencia).
  const claveEvento = claveWebhook('connect', event.id);
  const adminDedup = getSupabaseAdmin();
  if (adminDedup && !await reclamarWebhookEvent(adminDedup, claveEvento, event.type)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // ⚠️ **Se responde 200 ANTES de procesar, y no es una optimización: es el
  // arreglo de un fallo medido.** Este handler encadena varias llamadas a la
  // API de Stripe antes de contestar, y a Stripe se le agotaba la espera:
  // de seis cobros reales de `studio-1` (9-11 ago), solo DOS llegaron por
  // webhook —en menos de dos segundos— y los otros CUATRO acabó entregándolos
  // el conciliador, siempre en un múltiplo exacto de cinco minutos. Cruzando la
  // hora del evento en Stripe con `recibos.entrega_aplicada_en` se ve sin
  // ambigüedad, y los intentos de entrega del panel lo confirmaron: timeout.
  //
  // Lo que se responde rápido es SOLO lo barato: firma verificada (si no, 400)
  // y reclamación de idempotencia (que sigue siendo síncrona a propósito — así
  // una reentrega de Stripe se descarta aunque el trabajo anterior siga en
  // vuelo).
  //
  // ⚠️ **Precio explícito de este cambio:** con el 200 ya enviado, un fallo
  // posterior YA NO provoca reintento de Stripe. La red de seguridad pasa a ser
  // solo `lib/inngest/conciliar-cobros.ts` — que es justo quien venía haciendo
  // el trabajo en 4 de cada 6 casos, así que no se pierde cobertura real. Si
  // algún día hiciera falta durabilidad de verdad aquí, la vía es encolar a
  // Inngest, descartada ahora por cuota (~84 % del plan gratuito).
  after(async () => {
    try {
      await procesarEvento(stripe, event, adminDedup, claveEvento);
    } catch (e) {
      // `after` corre fuera del ciclo de la petición: una excepción aquí no
      // llega a ningún sitio si no se recoge a mano.
      Sentry.captureException(e instanceof Error ? e : new Error('webhook stripe'), {
        tags: { area: 'cobros', tipo: 'webhook-post-respuesta' },
        extra: { eventId: event.id, eventType: event.type },
      });
    }
  });
  return NextResponse.json({ received: true });
}

// Los manejadores de reembolso/disputa necesitan el PaymentIntent porque la
// metadata con `reciboId` vive ahí, no en el charge — y este retrieve corre
// dentro de `after()`, con el 200 ya enviado. Si lanza, Stripe NO va a
// reintentar el evento y no existe ningún conciliador de reembolsos ni de
// disputas que lo recoja después: el recibo se quedaría COBRADO con el dinero
// ya devuelto, y la única señal era la excepción genérica del catch de
// `after()`, indistinguible de cualquier otro fallo. El SDK ya reintenta solo
// los fallos transitorios (maxNetworkRetries=2 por defecto: cortes de
// conexión, 409, 5xx y todo lo que Stripe marque con `stripe-should-retry`),
// así que llegar aquí es un fallo SOSTENIDO que alguien tiene que mirar.
//
// La reclamación de idempotencia NO se marca en este camino (expira sola en
// 120 s), así que el `queHacer` del aviso funciona de verdad: reenviar el
// evento desde el Dashboard de Stripe lo reprocesa entero.
async function recuperarPaymentIntent(
  stripe: Stripe,
  piId: string,
  event: Stripe.Event,
  tipo: 'reembolso-perdido' | 'disputa-perdida',
): Promise<Stripe.PaymentIntent | null> {
  try {
    return await stripe.paymentIntents.retrieve(piId, {}, event.account ? { stripeAccount: event.account } : undefined);
  } catch (e) {
    Sentry.captureMessage('[stripe webhook] reversión de dinero SIN aplicar: no se pudo recuperar el PaymentIntent', {
      level: 'error',
      tags: { area: 'cobros', tipo },
      extra: {
        eventId: event.id,
        eventType: event.type,
        paymentIntentId: piId,
        eventAccount: event.account,
        detalle: e instanceof Error ? e.message : String(e),
        queHacer: 'El recibo puede seguir COBRADO con el dinero ya revertido. Esperar ~2 min (la reclamación de idempotencia expira a los 120 s; antes, el reenvío se descarta como duplicado) y reenviar el evento desde el Dashboard de Stripe (Developers → Events → Resend): el reenvío se procesa entero.',
      },
    });
    return null;
  }
}

/** Todo el trabajo pesado. Su valor de retorno se descarta: la respuesta ya se envió. */
async function procesarEvento(
  stripe: Stripe,
  event: Stripe.Event,
  adminDedup: ReturnType<typeof getSupabaseAdmin>,
  claveEvento: string,
): Promise<NextResponse> {

  // Esta es la fuente de verdad real del pago — el redirect al navegador
  // (success_url) solo actualiza la UI de forma optimista, pero si el
  // navegador se cierra antes de volver, esto es lo único que sí confirma
  // el cobro contra la base de datos.
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const reciboId = session.metadata?.reciboId;
    const socioId = session.metadata?.socioId;
    const studioId = session.metadata?.studioId;
    // Compra de un PLAN desde el enlace público. Se escribía en el checkout y
    // aquí no se leía nunca: Stripe cobraba y no se entregaba nada.
    const planId = session.metadata?.planId;
    // P1 auditoría Momence: lead-id crudo del widget público.
    const origenLead = session.metadata?.origenLead;
    // Auditoría vs Momence (#canje-codigos-descuento-checkout): el código ya
    // se validó y descontó del importe al crear la sesión — aquí solo se
    // consume el uso, y solo tras confirmar el pago (nunca al crear el
    // checkout: un checkout abandonado no debe gastar el uso de nadie).
    const codigoDescuentoId = session.metadata?.codigoDescuentoId;

    // P0-18: la persistencia se hace con service-role (bypassa RLS; el webhook
    // no tiene sesión de usuario) y cualquier fallo de escritura devuelve un
    // 5xx para que Stripe REINTENTE la entrega. Antes, dbUpdate* solo hacía
    // console.error sin lanzar y el endpoint respondía 200 igualmente: el pago
    // se cobraba en Stripe pero el recibo quedaba PENDIENTE para siempre.
    const admin = getSupabaseAdmin();
    if (!admin) {
      console.error('[stripe webhook] service role no configurada');
      return NextResponse.json({ error: 'Persistencia no disponible' }, { status: 503 });
    }

    if (session.mode === 'setup' && session.metadata?.purpose === 'tarjeta') {
      // La socia autorizó una tarjeta sin pagar nada (/api/stripe/setup-tarjeta).
      // Es el único camino por el que una socia que paga en mostrador, por
      // Bizum o importada de otra plataforma llega a tener método cobrable.
      // Mismo trato que el guardado tras un pago: si no se puede persistir se
      // devuelve 5xx y Stripe reintenta (idempotente, mismos ids).
      if (socioId && typeof session.setup_intent === 'string') {
        const si = await stripe.setupIntents.retrieve(
          session.setup_intent,
          { expand: ['payment_method'] },
          event.account ? { stripeAccount: event.account } : undefined,
        );
        const pm = si.payment_method;
        const pmId = typeof pm === 'string' ? pm : (pm?.id ?? null);
        const esTarjeta = typeof pm === 'string' ? true : pm?.type === 'card';
        if (!studioId) {
          // Mismo criterio que el guardado tras pago: sin studioId no se acota
          // el UPDATE al estudio dueño de la socia, y no se escribe.
          Sentry.captureMessage('[stripe webhook] setup de tarjeta sin studioId: no se guarda', {
            level: 'warning', extra: { socioId, sessionId: session.id },
          });
        } else if (pmId && esTarjeta) {
          const update: Record<string, string> = { stripe_payment_method_id: pmId };
          if (typeof session.customer === 'string') update.stripe_customer_id = session.customer;
          const { error } = await admin.from('socios')
            .update(update).eq('id', socioId).eq('studio_id', studioId);
          if (error) {
            console.error('[stripe webhook] no se pudo guardar la tarjeta autorizada', socioId, error);
            return NextResponse.json({ error: 'Fallo al guardar la tarjeta' }, { status: 500 });
          }
          // Caducidad para los avisos de Fase 3 del Brain. Best-effort: lo que
          // importa (poder cobrar) ya está escrito.
          await guardarCaducidadTarjeta(admin, stripe, {
            socioId, studioId, paymentMethodId: pmId, stripeAccount: event.account,
          });
        }
      }
    } else if (session.mode === 'setup' && session.metadata?.purpose === 'sepa_mandate') {
      // Fase 1 · PR-2 — alta de mandato SEPA: la socia aceptó la domiciliación.
      // Guardamos el PaymentMethod (sepa_debit) y el mandato para poder cobrar
      // la mensualidad off-session (PR-3). El SetupIntent vive en la cuenta
      // conectada (event.account) — hay que targetearla explícitamente.
      if (socioId && typeof session.setup_intent === 'string') {
        const si = await stripe.setupIntents.retrieve(
          session.setup_intent,
          {},
          event.account ? { stripeAccount: event.account } : undefined,
        );
        const pmId = typeof si.payment_method === 'string' ? si.payment_method : si.payment_method?.id;
        const mandateId = typeof si.mandate === 'string' ? si.mandate : (si.mandate?.id ?? null);
        if (pmId) {
          const update: Record<string, string | null> = {
            sepa_payment_method_id: pmId,
            sepa_mandate_id: mandateId,
            metodo_pago_preferido: 'SEPA',
          };
          if (typeof session.customer === 'string') update.stripe_customer_id = session.customer;
          const { error } = await admin.from('socios').update(update).eq('id', socioId);
          if (error) {
            console.error('[stripe webhook] no se pudo guardar el mandato SEPA', socioId, error);
            return NextResponse.json({ error: 'Fallo al guardar el mandato SEPA' }, { status: 500 });
          }
        }
      }
    } else {
      // La sesión puede completarse SIN pago (importe diferido, método pendiente
      // de confirmación). Marcar COBRADO en ese caso da por cobrado dinero que no
      // ha entrado. Se responde 200 para que Stripe no reintente: el evento es
      // válido, simplemente no confirma ningún cobro.
      // Va DENTRO de esta rama a propósito: el alta de mandato SEPA (arriba) es
      // mode='setup' y nunca tiene payment_status 'paid'.
      if (session.payment_status !== 'paid') {
        return NextResponse.json({ received: true, ignorado: 'pago_no_completado' });
      }

      // El tenant se resuelve desde la CUENTA que firma, no desde la metadata:
      // `metadata.studioId` lo elige quien crea la sesión. El porqué completo, y
      // el ataque que esto cierra, en `lib/billing/webhook-tenant.ts`.
      const studioDeCuenta = await studioDeCuentaConnect(admin, event.account);
      if (!tenantAutorizado(studioDeCuenta, studioId)) {
        Sentry.captureMessage('[stripe webhook] la cuenta Connect no corresponde al estudio de la metadata', {
          level: 'error',
          extra: { sessionId: session.id, eventAccount: event.account, studioIdMetadata: studioId, studioDeCuenta },
        });
        return NextResponse.json({ error: 'Cuenta Connect no autorizada para este estudio' }, { status: 403 });
      }

      // El recibo es lo crítico (confirma el cobro). Registramos el método real
      // del cobro (tarjeta/bizum) para la conciliación con el gestor.
      if (reciboId) {
        // Sin studioId no se puede comprobar que el recibo pertenezca a este
        // estudio, y el UPDATE iría sin acotar por tenant.
        if (!studioId) {
          Sentry.captureMessage('[stripe webhook] checkout.session con reciboId sin studioId', {
            level: 'error', extra: { reciboId, sessionId: session.id },
          });
          return NextResponse.json({ error: 'Metadata incompleta' }, { status: 400 });
        }
        const { data: reciboRow } = await admin
          .from('recibos').select('id, importe, estado').eq('id', reciboId).eq('studio_id', studioId).maybeSingle();
        if (!reciboRow) {
          Sentry.captureMessage('[stripe webhook] checkout.session apunta a recibo inexistente o de otro estudio', {
            level: 'warning', extra: { reciboId, studioId, sessionId: session.id },
          });
          return NextResponse.json({ error: 'Recibo no encontrado' }, { status: 404 });
        }
        const esperadoCentimos = Math.round(Number(reciboRow.importe) * 100);
        if (typeof session.amount_total !== 'number' || session.amount_total < esperadoCentimos) {
          Sentry.captureMessage('[stripe webhook] importe de checkout inferior al recibo', {
            level: 'error', extra: { reciboId, studioId, amountTotal: session.amount_total, esperadoCentimos },
          });
          return NextResponse.json({ error: 'Importe insuficiente' }, { status: 409 });
        }
        // Si se ofreció Bizum, el método real puede ser bizum O tarjeta → lo
        // leemos del cargo para registrar metodo_cobro con exactitud. Si no se
        // ofreció Bizum, es tarjeta y evitamos la llamada extra.
        const pmTypes = (session.payment_method_types ?? []) as string[];
        let metodoCobro = 'TARJETA';
        if (pmTypes.includes('bizum') && typeof session.payment_intent === 'string') {
          try {
            const piPago = await stripe.paymentIntents.retrieve(
              session.payment_intent, { expand: ['latest_charge'] },
              event.account ? { stripeAccount: event.account } : undefined,
            );
            const tipo = (piPago.latest_charge as Stripe.Charge | null)?.payment_method_details?.type;
            metodoCobro = tipo === 'bizum' ? 'BIZUM' : 'TARJETA';
          } catch { /* si falla la lectura, dejamos TARJETA por defecto */ }
        }
        const piId = typeof session.payment_intent === 'string' ? session.payment_intent : null;
        const { data: marcado, error } = await admin.from('recibos')
          .update({
            estado: 'COBRADO', fecha_cobro: new Date().toISOString(), metodo_cobro: metodoCobro,
            // Un cobro por checkout no dejaba el PaymentIntent en NINGUNA parte
            // de Tentare (solo lo escribían el cobro off-session y la compra de
            // plan). Por eso /api/reembolsos tenía que buscarlo en Stripe por
            // metadata['reciboId'], y con dos cargos descartaba el resultado y
            // respondía "no encontramos el cobro de este recibo".
            ...(piId ? { stripe_payment_intent_id: piId } : {}),
            // Pagada: deja de haber una sesión abierta que reutilizar.
            checkout_session_id: null,
          })
          // Acotado al tenant y a los estados realmente cobrables, que según el
          // CHECK de `recibos` son PENDIENTE, FALLIDO (recuperación tras dunning)
          // y EN_CURSO (adeudo SEPA en vuelo: el portal se lo muestra a la socia
          // como pendiente, así que un pago con tarjeta sobre él es legítimo y
          // debe marcarlo cobrado). Quedan fuera COBRADO —para no reescribir la
          // fecha_cobro con un evento tardío o duplicado— y DEVUELTO, para no
          // resucitar un recibo ya devuelto.
          .eq('id', reciboId).eq('studio_id', studioId)
          .in('estado', ['PENDIENTE', 'FALLIDO', 'EN_CURSO'])
          .select('id').maybeSingle();
        if (error) {
          console.error('[stripe webhook] no se pudo marcar el recibo como COBRADO', reciboId, error);
          return NextResponse.json({ error: 'Fallo al persistir el cobro' }, { status: 500 });
        }
        // 0 filas tiene DOS causas muy distintas y hasta ahora se trataban igual
        // (ni siquiera se miraba: el update iba sin `.select()`):
        //   · Stripe reentrega el MISMO evento — normal, no hay nada que hacer.
        //   · Un SEGUNDO cobro real del mismo recibo — dinero cobrado dos veces.
        // Se distinguen por el PaymentIntent: si el recibo ya guarda uno y llega
        // otro distinto, no es un reintento. Es el aviso que faltaba para que
        // esto deje de ser invisible; devolver el cargo sigue siendo manual.
        if (!marcado && piId) {
          const { data: previo } = await admin.from('recibos')
            .select('stripe_payment_intent_id')
            .eq('id', reciboId).eq('studio_id', studioId).maybeSingle();
          const anterior = (previo?.stripe_payment_intent_id as string | null) ?? null;
          if (anterior && anterior !== piId) {
            Sentry.captureMessage('[stripe webhook] SEGUNDO cobro del mismo recibo: hay que devolver uno', {
              level: 'error',
              extra: {
                reciboId, studioId, sessionId: session.id,
                paymentIntentCobrado: anterior, paymentIntentDuplicado: piId,
              },
            });
          }
        }
        // Renovación en servidor (refill de bono / extensión del mensual):
        // antes solo la aplicaba el panel al "marcar cobrado" a mano, así que
        // un pago por enlace dejaba la suscripción sin renovar hasta que
        // alguien abría el panel. Best-effort e idempotente.
        await aplicarRenovacionServidor(admin, { studioId, reciboId });
        // Sellado de factura: mismo criterio que cobrarReciboOffSession
        // (lib/billing/stripe-cobros.ts) y confirmarCobroExitoso — este
        // era el ÚNICO de los tres caminos de dinero real que no la sellaba.
        // Un pago desde el portal (la socia paga su recibo pendiente vía
        // Checkout hospedado) confirmaba el cobro y nunca generaba factura;
        // best-effort e idempotente: el cobro ya está persistido, un fallo
        // aquí no puede tumbar el evento.
        const selladoFactura = await sellarFacturaDeRecibo(admin, {
          studioId, reciboId, facturaId: `fac-checkout-${reciboId}`,
        });
        if (!selladoFactura.ok) {
          Sentry.captureMessage('[stripe webhook] cobro OK pero factura sin sellar', {
            level: 'warning', tags: { area: 'cobros', tipo: 'facturacion' },
            extra: { reciboId, studioId, error: selladoFactura.error },
          });
        }
        // Notification Engine: confirmación de pago a la socia.
        const { emitirPagoRealizado } = await import('@/lib/notifications/emit');
        await emitirPagoRealizado(admin, { studioId, reciboId });
        // Email de confirmación con enlace a su factura — best-effort, ver
        // enviarEmailReciboWebhook (nunca lanza, no puede tumbar el webhook).
        const { enviarEmailReciboWebhook } = await import('@/lib/emails/enviar-recibo-webhook');
        await enviarEmailReciboWebhook(admin, { studioId, reciboId });
      }

      // Compra de un plan desde el enlace público: crear el bono que se acaba de
      // pagar. Un fallo aquí devuelve 5xx para que Stripe REINTENTE — el dinero
      // ya está cobrado, así que no entregarlo no puede quedarse en un log.
      if (planId && !reciboId) {
        if (!studioId) {
          Sentry.captureMessage('[stripe webhook] compra de plan sin studioId', {
            level: 'error', extra: { planId, sessionId: session.id },
          });
          return NextResponse.json({ error: 'Metadata incompleta' }, { status: 400 });
        }
        const { entregarPlanComprado } = await import('@/lib/billing/entregar-plan-comprado');
        const entrega = await entregarPlanComprado(admin, {
          sessionId: session.id,
          studioId,
          planId,
          socioId: socioId ?? null,
          // Email verificado por Stripe: es a quien hay que entregarle el bono
          // si compró antes de registrarse.
          email: session.customer_details?.email ?? session.customer_email ?? null,
          nombre: session.customer_details?.name ?? null,
          // Lo cobrado DE VERDAD, no el precio de catálogo releído ahora: entre
          // abrir el checkout y llegar este webhook el estudio puede haber
          // cambiado el precio del plan.
          importeCobradoCentimos: typeof session.amount_total === 'number' ? session.amount_total : null,
          // El cargo real, para poder devolverlo después desde el panel sin
          // buscarlo a mano en Stripe.
          paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
          origenLead: origenLead ?? null,
        });
        if (!entrega.ok) {
          Sentry.captureMessage('[stripe webhook] cobrado pero NO entregado', {
            level: 'error',
            extra: { planId, studioId, sessionId: session.id, motivo: entrega.motivo, detalle: entrega.detalle },
          });
          // 'sin-socia' no se arregla reintentando (no hay email al que entregar):
          // se responde 200 para no encolar reintentos eternos, pero queda en
          // Sentry como cobro pendiente de resolver a mano.
          if (entrega.motivo === 'sin-socia' || entrega.motivo === 'plan-no-encontrado') {
            return NextResponse.json({ received: true, entregado: false, motivo: entrega.motivo });
          }
          return NextResponse.json({ error: 'Fallo al entregar el plan comprado' }, { status: 500 });
        }
        // Sin esto, una compra de plan por el enlace público es INVISIBLE a
        // reembolsos y disputas: sus handlers leen `pi.metadata.reciboId`, y el
        // PaymentIntent de una compra de plan nace sin metadata porque el recibo
        // todavía no existía al crear la sesión. Se devolvía el dinero y el
        // `rec-web-…` se quedaba COBRADO para siempre, con la suscripción activa.
        // Best-effort: el bono ya está entregado y el cobro registrado, así que
        // un fallo aquí no puede tumbar el evento — pero sí queda en Sentry.
        if (typeof session.payment_intent === 'string') {
          try {
            await stripe.paymentIntents.update(
              session.payment_intent,
              { metadata: { reciboId: entrega.reciboId, origen: 'plan_web', studioId } },
              event.account ? { stripeAccount: event.account } : undefined,
            );
          } catch (err) {
            Sentry.captureMessage('[stripe webhook] plan entregado pero sin metadata en el PaymentIntent', {
              level: 'warning',
              extra: { sessionId: session.id, reciboId: entrega.reciboId, studioId, detalle: String(err) },
            });
          }
        }
        // Consumo del código de descuento (best-effort, igual que la
        // actualización de metadata de arriba): el pago ya está cobrado y el
        // plan ya entregado, así que un fallo aquí no puede tumbar el evento
        // — pero sí queda en Sentry, porque un código que no se descuenta de
        // su límite es un uso gratis que nadie contó.
        //
        // tentare-stripe: consumir_codigo_descuento no es idempotente por sí
        // sola (solo protege contra concurrencia del POS, no contra que este
        // webhook reprocese el MISMO evento). El INSERT en
        // codigos_descuento_consumos es el compare-and-set: gana el primer
        // intento, un reintento choca por PK (23505) y se salta el consumo
        // sin sumar un uso de más — mismo criterio que entregarPlanComprado.
        if (codigoDescuentoId) {
          const { error: errMarcarConsumo } = await admin
            .from('codigos_descuento_consumos')
            .insert({ recibo_id: entrega.reciboId, codigo_id: codigoDescuentoId });
          if (!errMarcarConsumo) {
            const { error: errConsumo } = await admin.rpc('consumir_codigo_descuento', { p_codigo_id: codigoDescuentoId });
            if (errConsumo) {
              Sentry.captureMessage('[stripe webhook] plan entregado pero el código de descuento no se consumió', {
                level: 'warning',
                extra: { codigoDescuentoId, studioId, sessionId: session.id, detalle: String(errConsumo) },
              });
            }
          } else if (errMarcarConsumo.code !== '23505') {
            Sentry.captureMessage('[stripe webhook] no se pudo registrar el consumo del código de descuento', {
              level: 'warning',
              extra: { codigoDescuentoId, studioId, sessionId: session.id, detalle: String(errMarcarConsumo) },
            });
          }
        }
        const { emitirPagoRealizado } = await import('@/lib/notifications/emit');
        await emitirPagoRealizado(admin, { studioId, reciboId: entrega.reciboId });
        const { enviarEmailReciboWebhook } = await import('@/lib/emails/enviar-recibo-webhook');
        await enviarEmailReciboWebhook(admin, { studioId, reciboId: entrega.reciboId });
      }

      // Guarda la tarjeta (Customer + PaymentMethod) para poder cobrar sola la
      // próxima vez. También crítico: un fallo aquí devuelve 5xx para reintentar
      // (idempotente: mismos customer/payment_method). Bizum no es guardable, así
      // que solo persiste tarjeta (setup_future_usage solo se pide en 'card').
      if (socioId && typeof session.customer === 'string' && typeof session.payment_intent === 'string') {
        // Este PaymentIntent vive en la cuenta conectada del estudio (event.account),
        // no en la de la plataforma — hay que targetearla explícitamente o Stripe
        // devuelve "no such payment_intent".
        const paymentIntent = await stripe.paymentIntents.retrieve(
          session.payment_intent,
          // Expandido a propósito: sin el objeto no se sabe con qué método se
          // pagó DE VERDAD, solo qué métodos se ofrecieron. En una sesión con
          // Bizum + tarjeta esa diferencia decide entre guardar una tarjeta
          // cobrable y guardar un método de Bizum que romperá el próximo cobro.
          // No cuesta una llamada extra: es el mismo retrieve.
          { expand: ['payment_method'] },
          event.account ? { stripeAccount: event.account } : undefined
        );
        // Una sola regla, con tests: lib/billing/metodo-reutilizable.ts.
        const paymentMethodId = metodoReutilizableDe(paymentIntent);
        if (paymentMethodId) {
          if (!studioId) {
            // Sin studioId no se puede acotar el UPDATE al estudio dueño de la
            // socia: preferimos no escribir a escribir cross-tenant sobre un id
            // que viene de metadata.
            Sentry.captureMessage('[stripe webhook] checkout.session sin studioId: no se guarda la tarjeta', {
              level: 'warning', extra: { socioId, sessionId: session.id },
            });
          } else {
            const { error } = await admin.from('socios')
              .update({ stripe_customer_id: session.customer, stripe_payment_method_id: paymentMethodId })
              .eq('id', socioId).eq('studio_id', studioId);
            if (error) {
              console.error('[stripe webhook] no se pudo guardar la tarjeta de la socia', socioId, error);
              return NextResponse.json({ error: 'Fallo al guardar el método de pago' }, { status: 500 });
            }
            // Y CUÁNDO caduca, para poder avisar antes de que falle el cobro
            // (Fase 3 del Brain). Va DESPUÉS y sin `await` sobre su resultado
            // crítico a propósito: `guardarCaducidadTarjeta` no lanza nunca, y
            // aunque Stripe no responda, el método de pago —que es lo que
            // importa— ya está guardado. Perder el mes de caducidad es molesto;
            // devolver 5xx aquí haría a Stripe reintentar un evento de cobro ya
            // confirmado.
            await guardarCaducidadTarjeta(admin, stripe, {
              socioId, studioId, paymentMethodId, stripeAccount: event.account,
            });
          }
        }
      }
    }

    // R4: señal de GMV (analítica de producto, no-op si POSTHOG_KEY no está).
    if (studioId && typeof session.amount_total === 'number') {
      capturar(studioId, { nombre: 'pago_completado', props: { importe_centimos: session.amount_total, via: 'checkout' } });
    }
  }

  // A-14 (backstop): el cobro por datáfono se confirma aquí aunque el POS se haya
  // cerrado tras el tap. Deja un marcador de reconciliación (idempotente por
  // PaymentIntent) para que ningún cobro quede sin registrar. El flujo normal del
  // POS lo marcará RECONCILIADO; si no llega a hacerlo, queda PENDIENTE y el staff
  // lo completa desde el POS. Solo aplica a los PI de terminal (origen marcado al
  // crearlos en /api/terminal/cobrar); el resto de payment_intent.succeeded se
  // ignora (los cobros con checkout ya se persisten vía checkout.session.completed).
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as Stripe.PaymentIntent;
    // Backstop de reconciliación POS: datáfono (pos_terminal) y Bizum presencial
    // (pos_bizum) comparten el mismo mecanismo — si el POS se cerró antes de
    // registrar la venta, el cobro aparece en "cobros sin registrar".
    const origenPos = pi.metadata?.origen;
    if (origenPos === 'pos_terminal' || origenPos === 'pos_bizum') {
      const studioId = pi.metadata.studioId;
      if (!studioId) {
        console.error('[stripe webhook] PI de terminal sin studioId en metadata', pi.id);
        return NextResponse.json({ received: true });
      }
      const admin = getSupabaseAdmin();
      if (!admin) {
        console.error('[stripe webhook] service role no configurada (reconciliación POS)');
        return NextResponse.json({ error: 'Persistencia no disponible' }, { status: 503 });
      }
      // Insert idempotente: si el POS ya registró la venta y marcó el marcador
      // RECONCILIADO, la PK del PaymentIntent hace que este INSERT choque (23505)
      // y no pisamos ese estado. Cualquier otro error → 5xx para que Stripe
      // reintente la entrega (no perder el cobro).
      const { error } = await admin.from('reconciliaciones_pos').insert({
        payment_intent_id: pi.id,
        studio_id: studioId,
        importe: (pi.amount_received ?? pi.amount ?? 0) / 100,
        concepto: pi.metadata.concepto ?? 'Venta POS',
      });
      if (error && error.code !== '23505') {
        console.error('[stripe webhook] no se pudo registrar la reconciliación POS', pi.id, error);
        return NextResponse.json({ error: 'Fallo al registrar la reconciliación' }, { status: 500 });
      }

      // R4: señal de GMV del cobro presencial (datáfono o Bizum).
      capturar(studioId, { nombre: 'pago_completado', props: { importe_centimos: pi.amount_received ?? pi.amount ?? 0, via: origenPos === 'pos_bizum' ? 'bizum' : 'terminal' } });
    }

    // Fase 3 — checkout embebido en el widget (Modo B): compra de un PLAN vía
    // PaymentIntent DIRECTO (sin Checkout Session), confirmada dentro del
    // propio Shadow Root con Stripe Elements. Misma forma que SEPA/POS arriba
    // (una rama más sobre pi.metadata?.origen), no un manejador nuevo. Diseño
    // completo: docs/checkout-embebido-diseno.md §5.
    if (pi.metadata?.origen === 'plan_web_embebido') {
      const admin = getSupabaseAdmin();
      if (!admin) {
        console.error('[stripe webhook] service role no configurada (checkout embebido)');
        return NextResponse.json({ error: 'Persistencia no disponible' }, { status: 503 });
      }
      // El tenant se resuelve desde la CUENTA que firma, no desde la metadata
      // — mismo criterio que checkout.session.completed (ver webhook-tenant.ts).
      const studioDeCuenta = await studioDeCuentaConnect(admin, event.account);
      if (!tenantAutorizado(studioDeCuenta, pi.metadata.studioId)) {
        Sentry.captureMessage('[stripe webhook] checkout embebido: la cuenta Connect no corresponde al estudio de la metadata', {
          level: 'error',
          extra: { paymentIntentId: pi.id, eventAccount: event.account, studioIdMetadata: pi.metadata.studioId, studioDeCuenta },
        });
        return NextResponse.json({ error: 'Cuenta Connect no autorizada para este estudio' }, { status: 403 });
      }
      const studioId = studioDeCuenta as string;
      const planId = pi.metadata.planId;
      if (!planId) {
        Sentry.captureMessage('[stripe webhook] checkout embebido sin planId en metadata', {
          level: 'error', extra: { paymentIntentId: pi.id, studioId },
        });
        return NextResponse.json({ error: 'Metadata incompleta' }, { status: 400 });
      }

      // Un fallo aquí devuelve 5xx para que Stripe REINTENTE — el dinero ya
      // está cobrado, así que no entregarlo no puede quedarse en un log.
      // Mismo criterio que la rama planId de checkout.session.completed.
      const { entregarPlanComprado } = await import('@/lib/billing/entregar-plan-comprado');
      const entrega = await entregarPlanComprado(admin, {
        sessionId: pi.id,
        studioId,
        planId,
        socioId: pi.metadata.socioId ?? null,
        email: pi.metadata.socioEmail ?? null,
        nombre: pi.metadata.socioNombre ?? null,
        // Saneado en checkout-embebido antes de entrar en la metadata; la
        // ficha nueva ya no se crea sin el teléfono que la persona escribió.
        telefono: pi.metadata.socioTelefono ?? null,
        // Lo cobrado DE VERDAD, no el precio de catálogo releído ahora.
        importeCobradoCentimos: pi.amount_received ?? pi.amount ?? null,
        // El cargo real, para poder devolverlo después desde el panel sin
        // buscarlo a mano en Stripe.
        paymentIntentId: pi.id,
        origenLead: pi.metadata.origenLead ?? null,
      });
      if (!entrega.ok) {
        Sentry.captureMessage('[stripe webhook] checkout embebido: cobrado pero NO entregado', {
          level: 'error',
          extra: { planId, studioId, paymentIntentId: pi.id, motivo: entrega.motivo, detalle: entrega.detalle },
        });
        // 'sin-socia'/'plan-no-encontrado' no se arreglan reintentando: se
        // responde 200 para no encolar reintentos eternos, y queda en Sentry
        // como cobro pendiente de resolver a mano — mismo criterio que arriba.
        if (entrega.motivo === 'sin-socia' || entrega.motivo === 'plan-no-encontrado') {
          return NextResponse.json({ received: true, entregado: false, motivo: entrega.motivo });
        }
        return NextResponse.json({ error: 'Fallo al entregar el plan comprado' }, { status: 500 });
      }

      // Sella el recibo en la metadata del PaymentIntent. SIN ESTO, una compra
      // por el checkout embebido es INVISIBLE a reembolsos y disputas: sus tres
      // handlers filtran por `pi.metadata.reciboId && ORIGENES_CON_RECIBO.has(
      // pi.metadata.origen)`, y aunque 'plan_web_embebido' SÍ está en esa lista
      // —lo que daba una falsa sensación de cobertura— el `reciboId` no se
      // escribía nunca aquí, porque el recibo `rec-web-…` no existe hasta que
      // `entregarPlanComprado` lo crea. La condición era siempre falsa: se
      // devolvía el dinero (o se perdía un chargeback) y el recibo se quedaba
      // COBRADO para siempre, con el bono activo y los ingresos inflados.
      //
      // Es exactamente el mismo olvido que documenta el comentario de
      // ORIGENES_CON_RECIBO, ahora en el sentido contrario: allí se añadió la
      // metadata y se olvidó la lista; aquí se añadió la lista y se olvidó la
      // metadata. Al añadir un origen nuevo hay que tocar LOS DOS SITIOS.
      //
      // Best-effort igual que en checkout.session.completed: el bono ya está
      // entregado, así que un fallo aquí no puede tumbar el evento — pero queda
      // en Sentry.
      try {
        await stripe.paymentIntents.update(
          pi.id,
          { metadata: { ...pi.metadata, reciboId: entrega.reciboId } },
          event.account ? { stripeAccount: event.account } : undefined,
        );
      } catch (err) {
        Sentry.captureMessage('[stripe webhook] checkout embebido: plan entregado pero sin reciboId en el PaymentIntent', {
          level: 'warning',
          extra: { paymentIntentId: pi.id, reciboId: entrega.reciboId, studioId, detalle: String(err) },
        });
      }

      // Guardado de tarjeta (§6 del diseño): con PaymentIntent directo, el
      // propio evento YA ES el PaymentIntent — a diferencia de
      // checkout.session.completed no hace falta expandir/recuperar nada.
      // Un fallo aquí devuelve 5xx para reintentar (idempotente: mismos
      // customer/payment_method). Bizum no aplica: este endpoint solo ofrece
      // tarjeta (payment_method_types:['card'] fijo).
      if (typeof pi.customer === 'string') {
        // Misma regla única que en checkout.session.completed. Aquí el evento ya
        // ES el PaymentIntent y este endpoint solo ofrece tarjeta, así que el
        // `payment_method` sin expandir basta.
        const pmReutilizable = metodoReutilizableDe(pi);
        if (pmReutilizable) {
          const { error } = await admin.from('socios')
            .update({ stripe_customer_id: pi.customer, stripe_payment_method_id: pmReutilizable })
            .eq('id', entrega.socioId).eq('studio_id', studioId);
          if (error) {
            console.error('[stripe webhook] no se pudo guardar la tarjeta de la socia (checkout embebido)', entrega.socioId, error);
            return NextResponse.json({ error: 'Fallo al guardar el método de pago' }, { status: 500 });
          }
          // Y CUÁNDO caduca (Fase 3 del Brain). Best-effort a propósito, igual
          // que en checkout.session.completed: el método de pago —lo que
          // importa— ya está guardado.
          await guardarCaducidadTarjeta(admin, stripe, {
            socioId: entrega.socioId, studioId, paymentMethodId: pmReutilizable, stripeAccount: event.account,
          });
        }
      }

      // Consumo del código de descuento — mismo criterio que
      // checkout.session.completed: best-effort, tras confirmar el pago, no
      // al crear el PaymentIntent, y con el mismo compare-and-set contra
      // reprocesamiento del evento (ver comentario largo en la otra rama).
      if (pi.metadata.codigoDescuentoId) {
        const { error: errMarcarConsumo } = await admin
          .from('codigos_descuento_consumos')
          .insert({ recibo_id: entrega.reciboId, codigo_id: pi.metadata.codigoDescuentoId });
        if (!errMarcarConsumo) {
          const { error: errConsumo } = await admin.rpc('consumir_codigo_descuento', { p_codigo_id: pi.metadata.codigoDescuentoId });
          if (errConsumo) {
            Sentry.captureMessage('[stripe webhook] checkout embebido: plan entregado pero el código de descuento no se consumió', {
              level: 'warning',
              extra: { codigoDescuentoId: pi.metadata.codigoDescuentoId, studioId, paymentIntentId: pi.id, detalle: String(errConsumo) },
            });
          }
        } else if (errMarcarConsumo.code !== '23505') {
          Sentry.captureMessage('[stripe webhook] checkout embebido: no se pudo registrar el consumo del código de descuento', {
            level: 'warning',
            extra: { codigoDescuentoId: pi.metadata.codigoDescuentoId, studioId, paymentIntentId: pi.id, detalle: String(errMarcarConsumo) },
          });
        }
      }

      const { emitirPagoRealizado } = await import('@/lib/notifications/emit');
      await emitirPagoRealizado(admin, { studioId, reciboId: entrega.reciboId });
      const { enviarEmailReciboWebhook } = await import('@/lib/emails/enviar-recibo-webhook');
      await enviarEmailReciboWebhook(admin, { studioId, reciboId: entrega.reciboId });

      // "Pagar y reservar sin login previo" (docs/reserva-sin-login-diseno.md
      // §4.2): si el checkout venía con una clase concreta, reservarla ahora
      // que el plan que la cubre ya está entregado. Best-effort a propósito,
      // igual que el guardado de tarjeta de arriba: el dinero y el plan ya
      // se entregaron, un fallo aquí no debe hacer que Stripe reintente el
      // cobro — se reporta a Sentry y queda para conciliación manual.
      if (pi.metadata.sesionId) {
        try {
          const { reservarPlazaTrasPagoPublico } = await import('@/lib/db/supabase-data-admin');
          const r = await reservarPlazaTrasPagoPublico({
            studioId, sesionId: pi.metadata.sesionId, socioId: entrega.socioId, paymentIntentId: pi.id,
          });
          if (!r.ok) {
            // `error`, no `warning`: la socia ha PAGADO por una clase concreta
            // y se ha quedado sin plaza. La pantalla ya le ha dicho que estaba
            // reservada (handlePagoExitoso pasa a 'done' sin volver a preguntar
            // al servidor), así que nadie más se va a enterar. Con `warning` no
            // saltaba ninguna alerta y esto se descubría por la socia.
            Sentry.captureMessage('[stripe webhook] checkout embebido: plan entregado pero NO se pudo reservar la clase', {
              level: 'error',
              extra: { studioId, sesionId: pi.metadata.sesionId, socioId: entrega.socioId, paymentIntentId: pi.id, motivo: r.motivo, detalle: r.detalle },
            });
            // I-3 (auditoría 19-ago): además de la alerta de Sentry, avisa al
            // mostrador dentro del propio panel — Sentry lo ve el equipo
            // técnico, esto lo ve quien puede llamar a la socia hoy mismo.
            // Best-effort: que falle este aviso no debe tumbar el webhook.
            const { emitirReservaPagadaSinPlaza } = await import('@/lib/notifications/emit');
            await emitirReservaPagadaSinPlaza(admin, { studioId, sesionId: pi.metadata.sesionId, socioId: entrega.socioId });
          }
        } catch (e) {
          Sentry.captureException(e, { extra: { contexto: 'reservarPlazaTrasPagoPublico', studioId, sesionId: pi.metadata.sesionId, paymentIntentId: pi.id } });
        }
      }

      // R4: señal de GMV (analítica de producto, no-op si POSTHOG_KEY no está).
      capturar(studioId, { nombre: 'pago_completado', props: { importe_centimos: pi.amount_received ?? pi.amount ?? 0, via: 'checkout' } });
    }

    // Fase 1 · PR-4 — cobro SEPA CONFIRMADO (asíncrono): el adeudo domiciliado
    // liquidó días después de enviarse. Marcamos el recibo COBRADO y sellamos su
    // factura del ciclo. El sellado es best-effort: un fallo NO bloquea la
    // confirmación del pago (se puede sellar a mano después) — evita reintentos
    // infinitos del webhook por un caso borde de facturación.
    if (pi.metadata?.origen === 'sepa_recibo' && pi.metadata?.reciboId) {
      const reciboId = pi.metadata.reciboId;
      const admin = getSupabaseAdmin();
      if (!admin) {
        console.error('[stripe webhook] service role no configurada (SEPA succeeded)');
        return NextResponse.json({ error: 'Persistencia no disponible' }, { status: 503 });
      }
      const studioId = await studioDeCuentaConnect(admin, event.account);
      if (!studioId) {
        Sentry.captureMessage('[stripe webhook] cobro SEPA de una cuenta Connect no reconocida', {
          level: 'error', extra: { reciboId, eventAccount: event.account },
        });
        return NextResponse.json({ error: 'Cuenta Connect no reconocida' }, { status: 403 });
      }
      const confirmado = await confirmarCobroExitoso({ admin, reciboId, studioId, metodo: 'SEPA' });
      if (!confirmado.ok) {
        // "Recibo no encontrado" es o bien el recibo ya no existe o es de otro
        // estudio (intento de confirmar un cobro ajeno) — se registra y se
        // rechaza; cualquier otro error de persistencia pide reintento a Stripe.
        if (confirmado.error === 'Recibo no encontrado') {
          Sentry.captureMessage('[stripe webhook] cobro SEPA apunta a recibo inexistente o de otro estudio', {
            level: 'error', extra: { reciboId, studioId, eventAccount: event.account },
          });
          return NextResponse.json({ error: 'Recibo no encontrado' }, { status: 404 });
        }
        console.error('[stripe webhook] no se pudo marcar el recibo SEPA COBRADO', reciboId, confirmado.error);
        return NextResponse.json({ error: 'Fallo al confirmar el cobro SEPA' }, { status: 500 });
      }
      capturar(studioId, { nombre: 'pago_completado', props: { importe_centimos: pi.amount_received ?? pi.amount ?? 0, via: 'sepa' } });
    }

    // D-6 (auditoría 20-ago) — cobro con TARJETA guardada confirmado. A
    // diferencia de SEPA, aquí el webhook NO es el camino normal:
    // cobrarReciboOffSession persiste de forma síncrona al confirmar el cargo,
    // y este evento llega igualmente para cada cobro. Esta rama es la RED que
    // faltaba, y cierra dos huecos reales:
    //   · COBRADO_SIN_PERSISTIR: el cargo entró en Stripe pero el UPDATE del
    //     recibo falló — antes solo quedaba un aviso en Sentry y reconciliación
    //     a mano.
    //   · D-5 con clave expirada: un fallo transitorio con cargo hecho se
    //     reintenta con la MISMA Idempotency-Key, pero las claves de Stripe se
    //     purgan a las ~24 h y el dunning corre a diario — si la clave murió,
    //     el reintento cobraría OTRA vez; con esta rama, el recibo ya estará
    //     COBRADO antes del siguiente barrido (el webhook llega en segundos) y
    //     el recibo sale de la lista de candidatos.
    // confirmarCobroExitoso distingue: recibo aún cobrable → recuperación
    // completa (con aviso y email a la socia — nadie más se lo dará); ya
    // COBRADO (el caso normal, la vía síncrona funcionó) → reparación muda de
    // lo idempotente, sin estrenar emails en cada cobro normal.
    if (pi.metadata?.origen === 'tarjeta_recibo' && pi.metadata?.reciboId) {
      const reciboId = pi.metadata.reciboId;
      const admin = getSupabaseAdmin();
      if (!admin) {
        console.error('[stripe webhook] service role no configurada (tarjeta succeeded)');
        return NextResponse.json({ error: 'Persistencia no disponible' }, { status: 503 });
      }
      const studioId = await studioDeCuentaConnect(admin, event.account);
      if (!studioId) {
        Sentry.captureMessage('[stripe webhook] cobro con tarjeta de una cuenta Connect no reconocida', {
          level: 'error', extra: { reciboId, eventAccount: event.account },
        });
        return NextResponse.json({ error: 'Cuenta Connect no reconocida' }, { status: 403 });
      }
      const confirmado = await confirmarCobroExitoso({
        admin, reciboId, studioId, metodo: 'TARJETA', paymentIntentId: pi.id,
      });
      if (!confirmado.ok) {
        if (confirmado.error === 'Recibo no encontrado') {
          Sentry.captureMessage('[stripe webhook] cobro con tarjeta apunta a recibo inexistente o de otro estudio', {
            level: 'error', extra: { reciboId, studioId, eventAccount: event.account },
          });
          return NextResponse.json({ error: 'Recibo no encontrado' }, { status: 404 });
        }
        console.error('[stripe webhook] no se pudo confirmar el cobro con tarjeta', reciboId, confirmado.error);
        return NextResponse.json({ error: 'Fallo al confirmar el cobro con tarjeta' }, { status: 500 });
      }
      // Sin `capturar` de GMV aquí a propósito: la vía síncrona ya lo captura
      // al cobrar (charge-off-session / cobrar-online) y este evento llega
      // TAMBIÉN en cada cobro normal — contarlo aquí duplicaría el GMV.
    }
  }

  // Fase 1 · PR-4 — adeudo SEPA FALLIDO (p. ej. fondos insuficientes al liquidar).
  // El recibo vuelve a PENDIENTE (para que el dunning pueda reintentar con un
  // adeudo nuevo) y contamos el intento. sepa_estado='failed' deja rastro.
  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object as Stripe.PaymentIntent;
    if (pi.metadata?.origen === 'sepa_recibo' && pi.metadata?.reciboId) {
      const reciboId = pi.metadata.reciboId;
      const admin = getSupabaseAdmin();
      if (!admin) {
        console.error('[stripe webhook] service role no configurada (SEPA failed)');
        return NextResponse.json({ error: 'Persistencia no disponible' }, { status: 503 });
      }
      const studioId = await studioDeCuentaConnect(admin, event.account);
      if (!studioId) {
        Sentry.captureMessage('[stripe webhook] adeudo SEPA fallido de una cuenta Connect no reconocida', {
          level: 'error', extra: { reciboId, eventAccount: event.account },
        });
        return NextResponse.json({ error: 'Cuenta Connect no reconocida' }, { status: 403 });
      }
      // Dunning (0041): cuenta el intento, reprograma el siguiente reintento
      // (+3/+7 días) o marca el recibo FALLIDO tras el tercero, y notifica a la
      // socia (1.er fallo / fallo definitivo) y al estudio (fallo definitivo).
      try {
        await registrarFalloCobro({ admin, reciboId, studioId, esSepa: true, ahoraISO: new Date().toISOString() });
      } catch (e) {
        console.error('[stripe webhook] no se pudo registrar el adeudo SEPA fallido (dunning)', reciboId, e);
        return NextResponse.json({ error: 'Fallo al registrar el adeudo SEPA fallido' }, { status: 500 });
      }
    }
  }

  // Fase 1 · PR-4 — DEVOLUCIÓN / reembolso (el adeudo SEPA se devolvió dentro de
  // las 8 semanas, o un reembolso manual). El recibo pasa a DEVUELTO. Los datos
  // de metadata viven en el PaymentIntent (no en el charge), así que lo
  // recuperamos targeteando la cuenta conectada.
  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
    if (piId) {
      const pi = await recuperarPaymentIntent(stripe, piId, event, 'reembolso-perdido');
      if (!pi) return NextResponse.json({ error: 'No se pudo recuperar el PaymentIntent' }, { status: 500 });
      const reciboId = pi.metadata?.reciboId;
      const esRecibo = ORIGENES_CON_RECIBO.has(pi.metadata?.origen ?? '');
      // Solo un reembolso TOTAL anula el recibo: marcar DEVUELTO un parcial
      // infravaloraría los ingresos y dejaría un estado incoherente (recibo
      // "devuelto" con el bono ya aplicado).
      //
      // ⚠️ Pero el parcial SÍ entra aquí. Antes esta condición lo dejaba fuera
      // del handler entero: no marcaba nada, no avisaba a nadie y no dejaba
      // rastro — y es el caso más habitual, el que hace una propietaria sensata
      // cuando la socia ya usó parte del bono. El comentario decía que
      // "requieren ajuste manual del estudio", pero nada le decía al estudio que
      // hubiera algo que ajustar.
      const acumuladoDevuelto = charge.amount_refunded ?? 0;
      const origen = origenDeReembolso({
        refunded: charge.refunded === true, acumulado: acumuladoDevuelto, total: charge.amount ?? 0,
      });
      if (reciboId && esRecibo) {
        const admin = getSupabaseAdmin();
        if (!admin) {
          console.error('[stripe webhook] service role no configurada (refund)');
          return NextResponse.json({ error: 'Persistencia no disponible' }, { status: 503 });
        }
        const studioId = await studioDeCuentaConnect(admin, event.account);
        if (!studioId) {
          Sentry.captureMessage('[stripe webhook] devolución de una cuenta Connect no reconocida', {
            level: 'error', extra: { reciboId, eventAccount: event.account },
          });
          return NextResponse.json({ error: 'Cuenta Connect no reconocida' }, { status: 403 });
        }
        if (origen === 'REEMBOLSO_TOTAL') {
          const { data: rec, error } = await admin.from('recibos')
            .update({ estado: 'DEVUELTO', fecha_devolucion: new Date().toISOString(), sepa_estado: pi.metadata?.origen === 'sepa_recibo' ? 'returned' : null })
            // `.neq('estado','DEVUELTO')` para que un reintento de Stripe no
            // reescriba la fecha_devolucion original con la de hoy.
            .eq('id', reciboId).eq('studio_id', studioId).neq('estado', 'DEVUELTO')
            .select('id').maybeSingle();
          if (error) {
            console.error('[stripe webhook] no se pudo marcar el recibo DEVUELTO', reciboId, error);
            return NextResponse.json({ error: 'Fallo al registrar la devolución' }, { status: 500 });
          }
          // 0 filas ya no es un error: puede ser el reintento del mismo evento.
          if (!rec) {
            Sentry.captureMessage('[stripe webhook] devolución sin efecto (recibo ya devuelto, inexistente o de otro estudio)', {
              level: 'warning', extra: { reciboId, studioId, eventAccount: event.account },
            });
          }
        }
        // Se anota SIEMPRE, total o parcial, y solo se avisa si es un hecho
        // nuevo (`null` = ya estaba registrada por un reintento).
        const dev = await registrarDevolucion(admin, {
          studioId, reciboId, origen, devueltoCentimos: acumuladoDevuelto,
          referencia: referenciaDevolucion({ tipo: 'reembolso', chargeId: charge.id, acumuladoDevueltoCentimos: acumuladoDevuelto }),
          stripeChargeId: charge.id,
        });
        if (dev) {
          const { emitirDevolucion } = await import('@/lib/notifications/emit');
          const { data: recSocio } = await admin.from('recibos').select('socio_id').eq('id', reciboId).maybeSingle();
          await emitirDevolucion(admin, {
            studioId, socioId: (recSocio?.socio_id as string | null) ?? null,
            devolucionId: dev.id, importe: dev.importeDevuelto, origen,
          });
        }
      }
    }
  }

  // Fase 1 (docs/ARQUITECTURA-LEGAL-PAGOS-FACTURACION.md) — disputa/chargeback:
  // el cargo ya se había cobrado y la socia lo impugna ante su banco. Antes esto
  // era invisible para Tentare (solo se veía entrando a Stripe directamente).
  // Los datos de metadata viven en el PaymentIntent (no en la disputa), igual
  // que en charge.refunded.
  if (event.type === 'charge.dispute.created') {
    const dispute = event.data.object as Stripe.Dispute;
    const piId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id;
    if (piId) {
      const pi = await recuperarPaymentIntent(stripe, piId, event, 'disputa-perdida');
      if (!pi) return NextResponse.json({ error: 'No se pudo recuperar el PaymentIntent' }, { status: 500 });
      const reciboId = pi.metadata?.reciboId;
      const esRecibo = ORIGENES_CON_RECIBO.has(pi.metadata?.origen ?? '');
      if (reciboId && esRecibo) {
        const admin = getSupabaseAdmin();
        if (!admin) {
          console.error('[stripe webhook] service role no configurada (dispute created)');
          return NextResponse.json({ error: 'Persistencia no disponible' }, { status: 503 });
        }
        const studioId = await studioDeCuentaConnect(admin, event.account);
        if (!studioId) {
          Sentry.captureMessage('[stripe webhook] disputa de una cuenta Connect no reconocida', {
            level: 'error', extra: { reciboId, eventAccount: event.account },
          });
          return NextResponse.json({ error: 'Cuenta Connect no reconocida' }, { status: 403 });
        }
        const { error } = await admin.from('recibos')
          .update({ disputa_estado: dispute.status, disputa_stripe_id: dispute.id })
          .eq('id', reciboId).eq('studio_id', studioId);
        if (error) {
          console.error('[stripe webhook] no se pudo registrar la disputa', reciboId, error);
          return NextResponse.json({ error: 'Fallo al registrar la disputa' }, { status: 500 });
        }
        const { emitirPagoDisputado } = await import('@/lib/notifications/emit');
        await emitirPagoDisputado(admin, { studioId, reciboId, plazoUnix: dispute.evidence_details?.due_by ?? null });
      }
    }
  }

  // Cierre de la disputa: `lost` es un chargeback real (el dinero se revierte,
  // igual que un reembolso total) — `won`/`warning_closed` no tocan el recibo,
  // solo el estado para que quede constancia de que se resolvió.
  if (event.type === 'charge.dispute.closed') {
    const dispute = event.data.object as Stripe.Dispute;
    const piId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id;
    if (piId) {
      const pi = await recuperarPaymentIntent(stripe, piId, event, 'disputa-perdida');
      if (!pi) return NextResponse.json({ error: 'No se pudo recuperar el PaymentIntent' }, { status: 500 });
      const reciboId = pi.metadata?.reciboId;
      const esRecibo = ORIGENES_CON_RECIBO.has(pi.metadata?.origen ?? '');
      if (reciboId && esRecibo) {
        const admin = getSupabaseAdmin();
        if (!admin) {
          console.error('[stripe webhook] service role no configurada (dispute closed)');
          return NextResponse.json({ error: 'Persistencia no disponible' }, { status: 503 });
        }
        const studioId = await studioDeCuentaConnect(admin, event.account);
        if (!studioId) {
          Sentry.captureMessage('[stripe webhook] cierre de disputa de una cuenta Connect no reconocida', {
            level: 'error', extra: { reciboId, eventAccount: event.account },
          });
          return NextResponse.json({ error: 'Cuenta Connect no reconocida' }, { status: 403 });
        }
        // Se parte en DOS escrituras a propósito. `disputa_estado` debe sellarse
        // SIEMPRE (es el estado real de la disputa en Stripe y es idempotente);
        // `estado`/`fecha_devolucion` necesitan el guardia `.neq('DEVUELTO')`
        // de su gemelo `charge.refunded`, para que una reentrega no reescriba
        // la fecha_devolucion original con la de hoy. Con una sola sentencia
        // había que elegir: o se perdía el guardia, o el guardia descartaba la
        // fila entera y `disputa_estado` no se guardaba nunca.
        const { error } = await admin.from('recibos')
          .update({ disputa_estado: dispute.status })
          .eq('id', reciboId).eq('studio_id', studioId);
        let errDevuelto = null;
        if (!error && dispute.status === 'lost') {
          const r = await admin.from('recibos')
            .update({ estado: 'DEVUELTO', fecha_devolucion: new Date().toISOString() })
            .eq('id', reciboId).eq('studio_id', studioId).neq('estado', 'DEVUELTO');
          errDevuelto = r.error;
        }
        if (errDevuelto) {
          console.error('[stripe webhook] disputa perdida: no se pudo marcar DEVUELTO', reciboId, errDevuelto);
          return NextResponse.json({ error: 'Fallo al cerrar la disputa' }, { status: 500 });
        }
        if (error) {
          console.error('[stripe webhook] no se pudo cerrar la disputa', reciboId, error);
          return NextResponse.json({ error: 'Fallo al cerrar la disputa' }, { status: 500 });
        }

        // Hasta ahora este cierre era MUDO: el estudio se enteraba de que le
        // abrían una disputa (`dispute.created` avisa con ALTA + push + email)
        // pero nunca de que la perdía — y es cuando el dinero se va de verdad y
        // la socia se queda con lo entregado.
        //
        // ⚠️ `charge_refunded` = el estudio reembolsó DURANTE la disputa. Ese
        // dinero ya lo anota `charge.refunded` con la misma referencia
        // (`chargeId:acumulado`), así que aquí no se vuelve a encolar: si no, la
        // propietaria vería dos tarjetas por el mismo dinero y podría revertir
        // dos veces.
        if (dispute.status === 'lost') {
          const cargoId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id ?? null;
          const dev = await registrarDevolucion(admin, {
            studioId, reciboId, origen: 'CHARGEBACK',
            devueltoCentimos: dispute.amount ?? 0,
            referencia: referenciaDevolucion({ tipo: 'chargeback', disputeId: dispute.id }),
            stripeChargeId: cargoId,
          });
          if (dev) {
            const { emitirDevolucion } = await import('@/lib/notifications/emit');
            const { data: recSocio } = await admin.from('recibos').select('socio_id').eq('id', reciboId).maybeSingle();
            await emitirDevolucion(admin, {
              studioId, socioId: (recSocio?.socio_id as string | null) ?? null,
              devolucionId: dev.id, importe: dev.importeDevuelto, origen: 'CHARGEBACK',
            });
          }
        }
      }
    }
  }

  // Stripe Connect: el estudio revocó el acceso desde SU panel de Stripe (o Stripe
  // desconectó la cuenta). Limpiamos el binding `stripe_account_id` para que la app
  // deje de intentar cobrar sobre una cuenta ya no conectada y la UI muestre "no
  // conectado". Idempotente: si ya está a null, el UPDATE no casa ninguna fila.
  if (event.type === 'account.application.deauthorized') {
    const accountId = event.account;
    if (accountId) {
      const admin = getSupabaseAdmin();
      if (!admin) {
        console.error('[stripe webhook] service role no configurada (deauthorized)');
        return NextResponse.json({ error: 'Persistencia no disponible' }, { status: 503 });
      }
      // Qué estudios pierden el cobro (antes de limpiar el binding).
      const { data: afectados } = await admin.from('studios').select('id').eq('stripe_account_id', accountId);
      const { error } = await admin.from('studios').update({ stripe_account_id: null }).eq('stripe_account_id', accountId);
      if (error) {
        console.error('[stripe webhook] no se pudo desvincular la cuenta desconectada', accountId, error);
        return NextResponse.json({ error: 'Fallo al desvincular la cuenta' }, { status: 500 });
      }
      // Notification Engine: aviso CRÍTICO a la dueña — se han parado los cobros.
      const { emitirStripeDesconectado } = await import('@/lib/notifications/emit');
      for (const s of afectados ?? []) {
        await emitirStripeDesconectado(admin, { studioId: s.id as string });
      }
    }
  }

  // M10: marcar el evento como procesado. Solo se llega aquí si todos los
  // handlers fueron OK; los caminos de error salen antes y NO marcan, así que
  // la reclamación expira sola y el evento puede volver a intentarse.
  //
  // ⚠️ Este comentario decía «y un reintento de Stripe la retoma». **Ya no**:
  // desde que el 200 se envía antes de procesar, Stripe da la entrega por
  // buena y no reintenta. Quien retoma el trabajo es el conciliador
  // (`lib/inngest/conciliar-cobros.ts`), no Stripe.
  if (adminDedup) await marcarWebhookProcesado(adminDedup, claveEvento);
  return NextResponse.json({ received: true });
}

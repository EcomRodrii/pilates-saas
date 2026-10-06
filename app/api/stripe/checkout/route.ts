import { sesionWidgetValida } from '@/lib/reservar/compra-en-embudo';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';
import { usoFuturoCheckoutHospedado } from '@/lib/billing/uso-futuro-tarjeta';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { bloqueoCobroManualDePenalizacion } from '@/lib/billing/penalizacion-recibo-server';
import { applicationFeeAmount } from '@/lib/billing/stripe-fees';
import { comprobarModoStripe, comprobarParDeClaves } from '@/lib/billing/modo-stripe';
import { bizumActivo } from '@/lib/billing/bizum-activo';
import { ofrecerBizum } from '@/lib/billing/bizum-permitido';
import { tipoDePlanDelRecibo } from '@/lib/billing/tipo-plan-de-recibo';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { parsearOrigenPago, urlsDeRetorno } from '@/lib/billing/origen-pago';
import { respuestaPreflightWidget, conCorsWidget } from '@/lib/cors-widget';
import {
  claveCheckoutRecibo, claveTrasSesion, decidirSesionCheckout, exigirSesionLeidaOEsta, expiraSesionIncrustada,
  MENSAJE_COMPRA_YA_PAGADA, MENSAJE_SESION_PREVIA_SIN_COMPROBAR, queHacerConSesionRepetida, respuestaIncrustada,
  type PeticionCheckout,
} from '@/lib/billing/sesion-checkout';
import { claveCheckoutPlanModoA } from '@/lib/billing/clave-checkout-embebido';
import { CODIGO_PAGO_EN_CURSO, esErrorDeIdempotencia, MENSAJE_PAGO_EN_CURSO } from '@/lib/billing/pago-en-curso';
import { resolverDescuentoCheckout } from '@/lib/billing/descuento-checkout';
import { esSociaNueva } from '@/lib/billing/socia-nueva';
import { rechazoCompraPrueba } from '@/lib/billing/clase-prueba';
import { codigosYaUsadosPorSocia } from '@/lib/billing/codigos-ya-usados';
import { primeraVezConPlan, reservarMatricula, liberarCupoMatricula, liberarCupoMatriculaUnaVez, esRespuestaRepetida } from '@/lib/billing/matricula-online';
import { recortarMetadata } from '@/lib/billing/pago-embebido-parametros';
import { mensajeClaseYaPagada } from '@/lib/billing/pago-anterior';
import { idsDe } from '@/lib/billing/ids-compra';
import {
  asignarRefPlaza, claveStripe, esEtapaAgotada, liberarPlazaPorRef, liberarPlazaSiEsDe, liberarPlazaSinCobro, MENSAJE_ETAPA_AGOTADA, recuperarPlazasCaducadas, reservarPlazaEtapa,
  type PlazaReservada,
} from '@/lib/opening/cupo';
import { mapCodigoDescuento } from '@/lib/supabase-data';
import type { RowCodigosDescuento } from '@/lib/db-types';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { cierreDeReserva, comprobarPlazaAntesDeCobrar, comprobarVentanaReserva, socioAutenticado } from '@/lib/db/supabase-data-admin';
import { caducidadCheckoutDeClase } from '@/lib/billing/bizum-clase';
import { IMPORTE_MINIMO_EUR, tienePrecioEspecial } from '@/lib/reservar/opciones-de-clase';
import { planDeClaseSuelta } from '@/lib/reservas/clase-suelta';
import { hidratarTiposDePlanes, mapPlanTarifa } from '@/lib/supabase-data';
import type { RowPlanesTarifa } from '@/lib/db-types';
import { bloqueoPorPreguntasAlta } from '@/lib/db/preguntas-alta-admin';
import { bloqueoPorSuscripcion } from '@/lib/billing/billing-guard';
import { esReciboCobrable, ESTADOS_COBRABLES } from '@/lib/billing/deuda-recibo';
import { CODIGO_CUOTA_EN_PAUSA, MENSAJE_CUOTA_EN_PAUSA, pagoOnlineDeRenovacionPermitido } from '@/lib/billing/renovar-plan-reglas';
import {
  MENSAJE_PAGO_ONLINE_COBRANDOSE_CON_METODO_GUARDADO, MENSAJE_RECIBO_YA_PAGADO_ONLINE,
} from '@/lib/billing/cobro-off-session-marca';
import { preparadorDeStripe, soltarCobroDeMostradorDelRecibo } from '@/lib/cobros/antes-de-cobrar-a-mano-servidor';
import {
  cerrarPagoOnlineAntesDeCobrarAMano, MINUTOS_COBRO_MOSTRADOR_ABANDONADO, sesionNoExisteEnStripe,
} from '@/lib/billing/pago-online-al-cobrar-a-mano';
import { vidaDelCobroDeLaCajaEnElRecibo } from '@/lib/pos/cobro-del-estudio';
import { MENSAJE_PAGO_ONLINE_CON_COBRO_DE_LA_CAJA } from '@/lib/pos/referencia-cobro-recibo';
import { telefonoValido } from '@/lib/csv';
import { paginaCerradaParaPeticion } from '@/lib/publico/pagina-cerrada-peticion';
import { cierreAperturaSuave, MENSAJE_APERTURA_SUAVE } from '@/lib/opening/apertura-suave';

// Inicia un pago con Stripe Checkout sobre la cuenta conectada del estudio
// (direct charge: el importe va a la cuenta del estudio; la plataforma recauda
// el take-rate vía application_fee_amount cuando está activo — lib/stripe-fees).
//
// SEGURIDAD: el importe y el concepto se derivan SIEMPRE de la base de datos
// —del recibo pendiente, o del plan de tarifa—, NUNCA del cuerpo de la
// petición. Antes el cliente enviaba `importe`, así que cualquiera podía pedir
// un checkout de 0,01 € para un recibo de 85 € (o para un recibo de otro
// estudio) y el webhook lo daría por COBRADO. Este endpoint es semipúblico por
// diseño (una socia paga desde /reservar sin sesión de staff), por eso la
// defensa correcta es validar el importe en el servidor, no exigir login de
// staff. Se comprueba además que el recibo/plan pertenezca al `studioId`.
//
// CORS (Fase 3 Booking Engine): el fallback de Bizum del checkout embebido
// (Modo B, `components/checkout-widget/checkout-embebido.tsx`) llama a este
// MISMO endpoint desde el dominio del estudio — con `?studioId=` en la URL
// para que el preflight resuelva la lista blanca. `conCorsWidget` no añade
// cabeceras si el Origin no coincide con `widget_dominios_autorizados`, y no
// afecta a las llamadas same-origin ya existentes de Modo A.
export async function OPTIONS(req: NextRequest) {
  return respuestaPreflightWidget(req);
}

/** «Ya has pagado esta clase», con lo que de verdad tiene (lib/billing/pago-anterior.ts). */
async function mensajeDeClasePagadaPorSesion(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, sesion: Stripe.Checkout.Session, studioId: string,
): Promise<string> {
  const pi = typeof sesion.payment_intent === 'string' ? sesion.payment_intent : sesion.payment_intent?.id ?? null;
  const [{ data: reserva }, { data: recibo }] = await Promise.all([
    pi
      ? admin.from('reservas').select('estado').eq('id', idsDe(pi).reservaId).eq('studio_id', studioId).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from('recibos').select('id').eq('id', idsDe(sesion.id).reciboId).eq('studio_id', studioId).maybeSingle(),
  ]);
  return mensajeClaseYaPagada({
    cobro: sesion.payment_status === 'paid' ? 'cobrado' : 'procesando',
    entregado: !!recibo,
    reserva: ((reserva as { estado?: string | null } | null)?.estado as string | null | undefined) ?? null,
  });
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'stripe-checkout', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return conCorsWidget(req, NextResponse.json({ error: 'Stripe no configurado. Añade STRIPE_SECRET_KEY en .env.local' }, { status: 503 }));
  }
  // La otra puerta por la que entra dinero (la socia paga desde el portal o un
  // enlace). Mismo guardia que el cobro automático: con el `.env.local` de
  // producción copiado a una máquina, esta ruta abriría un checkout que cobra
  // de verdad. Ver lib/billing/modo-stripe.ts.
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
    reciboId?: string;
    planId?: string;
    socioId?: string | null;
    socioEmail?: string | null;
    socioNombre?: string;
    // Desde dónde se paga. Decide a qué pantalla devuelve Stripe, y NADA más:
    // es una etiqueta de una lista blanca, nunca una URL (ver origen-pago.ts).
    origen?: string;
    // Pagos España (PR-5): ofrecer Bizum además de tarjeta en pagos PUNTUALES
    // (clase suelta, bono). Bizum no es recurrente ni guardable: en una CUOTA
    // este campo se IGNORA y se ofrece solo tarjeta — ver `tipoPlanCobrado` y
    // lib/billing/bizum-permitido.ts.
    bizum?: boolean;
    // P-2 (auditoría 58ª): prueba de que la persona marcó la casilla legal
    // ANTES de pagar. Solo se exige (ver `exigeAceptacionExplicita`) cuando el
    // estudio reescribió su política de privacidad o sus términos -- para el
    // resto, que ni siquiera pinta la casilla, no cambia nada.
    aceptaCondiciones?: boolean;
    // P1 auditoría Momence: lead-id crudo del widget público (`?ref=`),
    // viaja en la metadata de Stripe hasta entregarPlanComprado.
    origenLead?: string | null;
    /** Sesión del widget público (lib/reservar/eventos.ts), para el embudo. */
    widgetSesion?: string | null;
    // Auditoría vs Momence (#canje-codigos-descuento-checkout): texto tal
    // cual lo escribe la socia. Solo aplica a compra de plan (body.planId),
    // nunca al cobro de un recibo ya generado — el importe de un recibo
    // viene fijado por reglas de facturación anteriores, no de marketing.
    codigoDescuento?: string;
    // "Pagar y reservar sin login previo" con Bizum: el fallback de Bizum
    // (docs/reserva-sin-login-diseno.md §4.1, mismo patrón que el fallback de
    // Modo B en usar-datos-widget.ts) reutiliza ESTE endpoint tras un intento
    // fallido/descartado del checkout embebido — que no admite Bizum en su
    // Payment Element (§4 del diseño de checkout embebido). Con `sesionId`
    // esto deja de ser "compra cualquier bono": es "paga esta clase concreta"
    // y hay que reservarla al confirmar el pago, igual que ya hace
    // /api/public/checkout-embebido.
    sesionId?: string;
    // "Elige tu plaza": el sitio concreto de la sala, si la tiene. Solo tiene
    // sentido junto a sesionId — nunca decide el importe.
    spotId?: string | null;
    socioTelefono?: string | null;
    // "Información adicional" del formulario de pago sin login — solo se
    // escriben al crear ficha NUEVA (mismo criterio que checkout-embebido).
    genero?: string | null;
    comoConociste?: string | null;
    codigoPostal?: string | null;
    /** ISO `yyyy-mm-dd`. */
    fechaNacimiento?: string | null;
    /**
     * RECIBOS (6-oct-2026): `'incrustado'` = la app de la alumna paga el recibo SIN
     * salir (Checkout de Stripe incrustado). Solo para un recibo, solo la titular con
     * su sesión, sin Bizum, y la respuesta es `{ clientSecret, checkoutSessionId }` en
     * vez de `{ url }`. Sin él, todo como siempre (panel, enlaces, web).
     */
    modo?: string;
  } | null;

  if (!body?.studioId) {
    return conCorsWidget(req, NextResponse.json({ error: 'Falta el estudio' }, { status: 400 }));
  }
  const incrustado = body.modo === 'incrustado';
  // P16: el checkout incrustado se monta en el navegador con la publicable: las dos claves del mismo modo.
  if (incrustado && !comprobarParDeClaves().ok) {
    console.error('[stripe/checkout]', (comprobarParDeClaves() as { motivo?: string }).motivo);
    return conCorsWidget(req, NextResponse.json({ error: 'El pago no está disponible ahora mismo. No se te ha cobrado nada.' }, { status: 503 }));
  }
  // El incrustado es solo para pagar un recibo que ya existe: una compra de plan
  // incrustada va por /api/public/checkout-embebido (Payment Element).
  if (incrustado && !body.reciboId) {
    return conCorsWidget(req, NextResponse.json({ error: 'Falta el recibo a pagar' }, { status: 400 }));
  }
  // Normalizado UNA vez y el MISMO en la clave de idempotencia (`claveCheckoutPlanModoA`
  // ya lo normalizaba) y en los parámetros de la sesión (`customer_email`): con otras
  // mayúsculas, el mismo intento iba con otros parámetros → `idempotency_error`.
  const socioEmail = typeof body.socioEmail === 'string' && body.socioEmail.trim()
    ? body.socioEmail.trim().toLowerCase()
    : null;

  // F-30 (auditoría 20ª pasada): esta es la OTRA puerta por la que entra
  // dinero (la socia paga desde el portal o un enlace público, sin sesión de
  // staff) — el guardia de suscripción ya protegía charge-off-session,
  // pos-bizum, terminal/cobrar y reembolsos, pero no esta ni
  // /api/public/checkout-embebido: un estudio con la suscripción a Tentare
  // caducada seguía cobrando a sus socias por enlace público y widget.
  const bloqueo = await bloqueoPorSuscripcion(body.studioId);
  if (bloqueo) return conCorsWidget(req, bloqueo);

  // El importe y el concepto se resuelven contra la BD, validando pertenencia
  // al estudio. metadata.socioId lo lee el webhook para guardar la tarjeta;
  // metadata.reciboId solo se pone para pagos de un recibo real (así el
  // webhook no intenta marcar como cobrado un recibo inexistente).
  let importe: number;
  let concepto: string;
  // P-1 (auditoría 26ª pasada): matrícula cobrada en este MISMO cargo, solo
  // en la rama de compra de plan (nunca en pago de un recibo ya existente).
  let matriculaCentimos = 0;
  // Lo que el plan cobra de matrícula (0 = no cobra). Se resuelve en la rama de
  // plan y se USA más abajo, cuando ya no queda ninguna validación que pueda
  // abortar la compra — ver el comentario de la reserva de plaza.
  let matriculaBase = 0;
  // Qué plaza de matrícula gratis se ha reservado, para poder devolverla si el
  // cobro no llega a crearse. `null` = no se reservó ninguna.
  let cupoMatriculaReservado: { planId: string; studioId: string } | null = null;
  // ⚠️ El `socioId` NUNCA se toma del body a pelo (auditoría 21/22-ago, C-1).
  // Antes era `body.socioId ?? null` sin comprobar nada: pagando con tarjeta
  // propia se podía escribir bono/recibo/suscripción a nombre de OTRA socia
  // —incluso de otro estudio— y sobrescribir su método de pago guardado, con
  // lo que los cobros off-session posteriores irían a la tarjeta del
  // atacante. `suscripciones_socio_id_fkey` es una FK simple a `socios(id)`,
  // no compuesta con `studio_id`, así que la BD tampoco lo impedía.
  // En la rama de RECIBO no hace falta: `socioId` sale de la fila del recibo
  // dos bloques más abajo, nunca del body. Solo la rama de PLAN confiaba en
  // el valor crudo — ahí se exige el Bearer del portal (ver más abajo).
  let socioId: string | null = null;
  // PAY-3 (auditoría 2026-09-16). Pagar un recibo por enlace NUNCA exige
  // sesión — la mayoría llegan por email/WhatsApp sin login. Pero
  // `socioId` en esa rama sale de `recibo.socio_id`, no de un JWT: si esa
  // marca "de confianza" a secas, quien conozca el reciboId (no es secreto
  // criptográfico) puede pagarlo con su propia tarjeta y, como la sesión pide
  // `setup_future_usage: 'off_session'`, el webhook la guardaría en la ficha
  // de la TITULAR del recibo. Esto decide si HAY sesión y si resuelve a la
  // MISMA persona — nunca bloquea el pago, solo si se puede guardar la
  // tarjeta de quien paga.
  let pagadorVerificado = false;
  // Sesión de Checkout que este recibo ya tenga abierta (migr 20260817214500).
  // Es lo que impide crear una SEGUNDA sesión pagable del mismo recibo.
  let sesionAbiertaId: string | null = null;
  // El cobro de la Caja que tenía el recibo al leerlo (`cobro_mostrador_pi`): el UPDATE
  // que guarda la sesión nueva exige que siga siendo ese.
  let cobroCajaLeido: string | null = null;
  // Qué se cobra, a efectos de Bizum (lib/billing/bizum-permitido.ts): el
  // `tipo` del plan, `SIN_PLAN`, o `null` si no se ha podido saber. Una cuota
  // (MENSUAL: mensual, trimestral o anual) no admite Bizum.
  let tipoPlanCobrado: string | null = null;
  // P16: si es el recibo de una RENOVACIÓN (para la regla de guardar la tarjeta).
  let reciboEsRenovacion = false;
  // Con clase concreta (P06): cuándo caduca la sesión, sacado del cierre de la reserva de la clase.
  let expiraPorClase: number | null = null;
  const metadata: Record<string, string> = { studioId: body.studioId };
  // Lo que el formulario puede cambiar sin ser otro intento (teléfono, sitio, la
  // pestaña del widget, el `?ref=`…). NO va al crear la sesión: con la misma clave
  // de idempotencia, Stripe exige parámetros idénticos y contestaba
  // `idempotency_error` en cuanto cambiaba uno, 24 h sin poder pagar. Se escribe
  // DESPUÉS (`sessions.update`), antes de devolver la URL. Ver
  // lib/billing/pago-embebido-parametros.ts (la misma regla en el checkout embebido).
  const metadataVolatil: Record<string, string> = {};

  if (body.reciboId) {
    const { data: recibo, error } = await admin
      .from('recibos')
      .select('importe, concepto, estado, studio_id, socio_id, checkout_session_id, cobro_off_session_clave, cobro_mostrador_pi, cobro_mostrador_checkout_session_id, importe_devuelto, reembolso_stripe_id, reembolso_solicitado_en, entrega_tipo, suscripcion_id, es_renovacion')
      .eq('id', body.reciboId)
      .maybeSingle();
    if (error || !recibo) {
      return conCorsWidget(req, NextResponse.json({ error: 'Recibo no encontrado' }, { status: 404 }));
    }
    if (recibo.studio_id !== body.studioId) {
      return conCorsWidget(req, NextResponse.json({ error: 'Ese recibo no pertenece a este estudio' }, { status: 403 }));
    }
    // ⚠️ Antes esto era `recibo.estado !== 'PENDIENTE'`. #1694 amplió a FALLIDO
    // los dos escritores del panel y se dejó ESTE, que es el único por el que
    // paga la socia: con el bloqueo por impago encendido quedaba sin poder
    // reservar y sin poder pagar (3 socias reales, 107 €, ver
    // lib/billing/deuda-recibo.ts). Ahora el criterio es uno solo y es el mismo
    // que usa la RPC `socio_tiene_impago` para bloquearla: lo que bloquea por
    // deuda tiene que poder pagarse.
    if (!esReciboCobrable(recibo as Parameters<typeof esReciboCobrable>[0])) {
      return conCorsWidget(req, NextResponse.json({ error: 'Este recibo ya no está pendiente de cobro' }, { status: 409 }));
    }
    // Se le está cobrando AHORA con su tarjeta o domiciliación guardada: abrirle (o
    // devolverle) un pago online sería un segundo cobro. Antes de reutilizar una
    // sesión abierta, y el UPDATE que guarda la sesión nueva lo vuelve a exigir.
    if (recibo.cobro_off_session_clave) {
      return conCorsWidget(req, NextResponse.json({ error: MENSAJE_PAGO_ONLINE_COBRANDOSE_CON_METODO_GUARDADO }, { status: 409 }));
    }
    // La renovación de una cuota en PAUSADA no se paga desde la app: al cobrarse
    // la dejaría ACTIVA sin que el estudio la reanudara (decisión del fundador,
    // 5-oct-2026; lib/billing/renovar-plan-reglas.ts). El estudio tampoco la cobra
    // con la cuota pausada (`puedeIntentarCobro`: CUOTA_PAUSADA). Sin poder leer la
    // cuota, no se abre el pago (503).
    if (recibo.es_renovacion === true && recibo.suscripcion_id) {
      const { data: cuota, error: errCuota } = await admin.from('suscripciones')
        .select('estado').eq('id', recibo.suscripcion_id as string).eq('studio_id', body.studioId).maybeSingle();
      if (errCuota) {
        return conCorsWidget(req, NextResponse.json({ error: 'No hemos podido comprobar tu plan. Inténtalo en un momento.' }, { status: 503 }));
      }
      if (!pagoOnlineDeRenovacionPermitido({ es_renovacion: true }, (cuota?.estado as string | null) ?? null)) {
        return conCorsWidget(req, NextResponse.json({ error: MENSAJE_CUOTA_EN_PAUSA, codigo: CODIGO_CUOTA_EN_PAUSA }, { status: 409 }));
      }
    }
    // Se le está cobrando AHORA en la Caja (datáfono o Bizum del mostrador): lo mismo,
    // sería un segundo cobro. Pero solo si ese cobro sigue vivo: uno viejo ya muerto
    // (un Bizum caducado, que nadie suelta) no puede dejarla sin pagar online para
    // siempre. Se mira SIN tocarlo (la Caja lo lleva), y el UPDATE de abajo exige que
    // siga siendo el mismo: uno nuevo de la Caja entre medias, y no se guarda.
    //
    // Salvo uno ABANDONADO: un datáfono que sigue esperando tarjeta pasado el margen
    // (`MINUTOS_COBRO_MOSTRADOR_ABANDONADO`, lo que dura un Bizum del mostrador) no lo
    // está cobrando nadie. Con el MISMO dueño que el mostrador y el cobro diario, se
    // cancela ESE cobro (nunca la acción del lector con otra venta) y se suelta: si no,
    // un datáfono que nadie canceló dejaba el recibo sin poder pagarse online nunca.
    cobroCajaLeido = (recibo.cobro_mostrador_pi as string | null) ?? null;
    if (cobroCajaLeido) {
      let vida = await vidaDelCobroDeLaCajaEnElRecibo(admin, body.studioId, body.reciboId, cobroCajaLeido, { origen: req.nextUrl.origin });
      if (vida === 'vivo') {
        const mostrador = await soltarCobroDeMostradorDelRecibo(admin, {
          studioId: body.studioId, reciboId: body.reciboId, referencia: cobroCajaLeido,
          checkoutSessionId: (recibo.cobro_mostrador_checkout_session_id as string | null) ?? null,
        }, preparadorDeStripe(admin, body.studioId), { cancelarPendienteTrasMs: MINUTOS_COBRO_MOSTRADOR_ABANDONADO * 60_000 });
        if (mostrador.tipo === 'SEGUIR') vida = 'muerto';
      }
      if (vida !== 'muerto') {
        return conCorsWidget(req, NextResponse.json({ error: MENSAJE_PAGO_ONLINE_CON_COBRO_DE_LA_CAJA }, { status: 409 }));
      }
    }
    // El recibo de una penalización (`rec-penaliz-*`) solo se paga con el cobro
    // decidido (RECIBO_CREADO) o con la penalización FALLIDA, que es deuda de la
    // alumna. Si no, se pagaba una PENDIENTE_APROBACION saltándose la aprobación y
    // el guardia de consentimiento, o una que se decidió no cobrar. Sin poder leer
    // la penalización, no se abre sesión (503). Va ANTES de reutilizar una sesión
    // abierta: una sesión vieja tampoco puede servir de puerta.
    const penalizacionNoPagable = await bloqueoCobroManualDePenalizacion(admin, {
      studioId: body.studioId, reciboId: body.reciboId, contexto: 'checkout_alumna',
    });
    if (penalizacionNoPagable) {
      return conCorsWidget(req, NextResponse.json({ error: penalizacionNoPagable.mensaje }, { status: penalizacionNoPagable.http }));
    }
    importe = Number(recibo.importe);
    concepto = recibo.concepto;
    socioId = recibo.socio_id ?? socioId;
    sesionAbiertaId = (recibo.checkout_session_id as string | null) ?? null;
    metadata.reciboId = body.reciboId;
    // PAY-3: sin exigir sesión (a diferencia de la rama de plan de abajo),
    // comprueba si la hay y si resuelve a la MISMA socia dueña del recibo.
    let haySesion = false;
    if (socioId) {
      const usuarioRecibo = await verificarUsuarioSupabase(req);
      if (usuarioRecibo) {
        haySesion = true;
        const socioIdDeSesion = await socioAutenticado(usuarioRecibo.userId, body.studioId);
        pagadorVerificado = !!socioIdDeSesion && socioIdDeSesion === socioId;
      }
    }
    // Incrustado = dentro de la app de la TITULAR: con su sesión y su recibo, o
    // nada. Una sesión anónima no se monta en la app de nadie (PAY-3): quien solo
    // conoce el reciboId sigue pudiendo pagarlo por el enlace de siempre.
    if (incrustado && !pagadorVerificado) {
      return conCorsWidget(req, haySesion
        ? NextResponse.json({ error: 'Este recibo no es tuyo.' }, { status: 403 })
        : NextResponse.json({ error: 'Tu sesión ha caducado. Vuelve a entrar: no se te ha cobrado nada.' }, { status: 401 }));
    }
    // ¿Es el recibo de una CUOTA? `entrega_tipo` se escribe DESPUÉS de cobrar,
    // así que un pendiente casi nunca lo trae y se mira el plan de su
    // suscripción (ver `tipoDeReciboParaBizum`). Si la consulta no da nada,
    // `null`: sin Bizum.
    // El mismo helper que usa el mostrador (`/api/pos/recibo`): el 14-sep esta
    // resolución vivía solo aquí y el TPV ofrecía Bizum en cuotas.
    reciboEsRenovacion = recibo.es_renovacion === true;
    tipoPlanCobrado = await tipoDePlanDelRecibo(admin, {
      entrega_tipo: (recibo.entrega_tipo as string | null) ?? null,
      suscripcion_id: (recibo.suscripcion_id as string | null) ?? null,
    });
  } else if (body.planId) {
    // Comprar un plan (o pagar y reservar una clase) desde fuera, con la página
    // oculta, no. Solo esta rama: pagar un RECIBO que ya se debe sigue abierto
    // (dinero ya decidido: lo cobra el dunning off-session, o la alumna desde Pagos si entra con la clave).
    const cerrada = await paginaCerradaParaPeticion(req, body.studioId);
    if (cerrada) return conCorsWidget(req, cerrada);
    const { data: plan, error } = await admin
      .from('planes_tarifa')
      .select('nombre, precio, studio_id, activo, matricula, tipo, es_prueba')
      .eq('id', body.planId)
      .maybeSingle();
    if (error || !plan) {
      return conCorsWidget(req, NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 }));
    }
    if (plan.studio_id !== body.studioId) {
      return conCorsWidget(req, NextResponse.json({ error: 'Ese plan no pertenece a este estudio' }, { status: 403 }));
    }
    if (!plan.activo) {
      return conCorsWidget(req, NextResponse.json({ error: 'Ese plan ya no está disponible' }, { status: 409 }));
    }
    // La identidad de la socia sale del JWT verificado, nunca del body — mismo
    // criterio que /api/public/checkout-embebido (auditoría 19-ago, c5539af3).
    // Sin socioId es el camino de invitada (compra sin ficha, más abajo).
    if (body.socioId) {
      const usuario = await verificarUsuarioSupabase(req);
      if (!usuario) {
        return conCorsWidget(req, NextResponse.json({ error: 'Inicia sesión para comprar.' }, { status: 401 }));
      }
      socioId = await socioAutenticado(usuario.userId, body.studioId);
      if (!socioId) {
        return conCorsWidget(req, NextResponse.json({ error: 'No autorizado' }, { status: 403 }));
      }
      // Mismo cierre que /api/public/checkout-embebido: con ficha y preguntas por
      // contestar, no se cobra un plan nuevo. Pagar un recibo que ya debe (rama
      // de arriba) sigue abierto.
      const sinPreguntas = await bloqueoPorPreguntasAlta(body.studioId, socioId, 'comprar');
      if (sinPreguntas) return conCorsWidget(req, sinPreguntas);
    }
    // Comprar un plan sin ficha: decide el estudio (0110). En EXIGIR_REGISTRO
    // no se cobra a quien no se ha registrado — sin ficha no hay contrato
    // aceptado, así que cobrar antes sería cobrar sin consentimiento.
    //
    // EXCEPCIÓN deliberada, la MISMA que su gemelo de origen
    // (/api/public/checkout-embebido/route.ts, donde está el razonamiento
    // largo): con `sesionId` esto ya no es «compra cualquier bono de forma
    // anónima» —lo que `compra_publica_modo` decide— sino «paga esta clase
    // concreta», el flujo que siempre está disponible sin registro previo.
    // #1864 copió aquí la validación de clase («RÉPLICA EXACTA») pero no esta
    // excepción, así que el botón «Pagar con Bizum» de «pagar y reservar sin
    // login previo» devolvía 409 en los 13 estudios (todos en EXIGIR_REGISTRO):
    // la funcionalidad no llegó a cobrar ni una vez.
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
    // «Clase de prueba»: la MISMA puerta que su gemelo /api/public/checkout-embebido.
    const rechazoPrueba = await rechazoCompraPrueba(admin, {
      studioId: body.studioId, plan: { es_prueba: plan.es_prueba, precio: plan.precio },
      socioId, email: socioEmail, sesionId: body.sesionId,
    });
    if (rechazoPrueba) {
      return conCorsWidget(req, NextResponse.json({ error: rechazoPrueba.error, codigo: rechazoPrueba.codigo }, { status: rechazoPrueba.status }));
    }
    importe = Number(plan.precio);
    concepto = plan.nombre;
    tipoPlanCobrado = (plan.tipo as string | null | undefined) ?? null;
    metadata.planId = body.planId;

    // Auditoría vs Momence: canje de código de descuento, solo en compra de
    // plan. El servidor SIEMPRE recalcula — el texto del código es lo único
    // que viaja del cliente, el importe final sale de aquí, nunca del body.
    // Un código inválido/caducado/agotado no bloquea la compra: se ignora en
    // silencio y se cobra el precio de catálogo (mismo criterio que el POS
    // congelado, que tampoco impedía la venta por un código malo).
    // Sin códigos sobre una prueba: ya es la oferta de bienvenida.
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
        importe = Math.max(0, Math.round((importe - resultado.descuento) * 100) / 100);
        const codigoAplicado = codigos.find(c => c.codigo.trim().toUpperCase() === body.codigoDescuento!.trim().toUpperCase());
        if (codigoAplicado) metadata.codigoDescuentoId = codigoAplicado.id;
      }
    }

    // P-1 (auditoría 26ª pasada): la matrícula se cobra la PRIMERA vez que
    // esta socia contrata un plan aquí — nunca sobre el código de descuento
    // (ese es del plan, no de esta venta aparte). La puerta se decide AQUÍ,
    // antes de cobrar: `entregarPlanComprado` ya no vuelve a preguntarlo,
    // solo registra lo que este importe diga que se cobró.
    //
    // Desde la promoción de matrícula (cupo + fecha), el IMPORTE ya no sale del
    // catálogo: lo decide `reservar_matricula` en la base, que además gasta la
    // plaza bajo un `for update`. Aquí solo se cobra lo que diga.
    // ⚠️ Aquí solo se ANOTA cuánto cobra este plan de matrícula. La plaza se
    // reserva lo más tarde posible (justo antes de crear el cobro, más abajo):
    // reservarla aquí la gastaba también cuando la petición moría en una de las
    // seis validaciones siguientes —clase llena, cancelada, ya empezada, plan
    // que no cubre el tipo, sin email, sin Stripe conectado—, y ninguno de esos
    // `return` la devolvía. Cuatro intentos fallidos y la promoción del cartel
    // («gratis para las 4 primeras») se agotaba sin una sola venta.
    matriculaBase = Number(plan.matricula);

    // "Pagar y reservar sin login previo" con Bizum (fallback de Modo B, ver
    // el tipo del body más arriba): si viene sesionId, comprobar que la clase
    // sigue viva y que el plan la cubre ANTES de generar una sesión de pago —
    // cobrar por una clase que ya no se puede reservar sería cobrar sin poder
    // entregar nada. RÉPLICA EXACTA de la misma validación en
    // /api/public/checkout-embebido/route.ts (el camino "de origen" de este
    // flujo): las dos puertas de cobro tienen que estar de acuerdo en qué
    // clase es reservable, porque el webhook de esta puerta (más abajo)
    // también va a intentar reservarla.
    if (body.sesionId) {
      if (!socioId && !socioEmail) {
        return conCorsWidget(req, NextResponse.json({ error: 'Falta el email' }, { status: 400 }));
      }
      const { data: sesion } = await admin
        .from('sesiones').select('inicio, cancelada, tipo_clase_id, precio_puntual')
        .eq('id', body.sesionId).eq('studio_id', body.studioId).maybeSingle();
      if (!sesion) return conCorsWidget(req, NextResponse.json({ error: 'Clase no encontrada' }, { status: 404 }));
      if (sesion.cancelada) return conCorsWidget(req, NextResponse.json({ error: 'Esta clase está cancelada' }, { status: 409 }));
      if (new Date(sesion.inicio as string).getTime() <= Date.now()) {
        return conCorsWidget(req, NextResponse.json({ error: 'Esta clase ya ha empezado' }, { status: 409 }));
      }
      const { data: tiposDelPlan } = await admin
        .from('plan_tipos_clase').select('tipo_clase_id').eq('plan_id', body.planId);
      if (tiposDelPlan && tiposDelPlan.length > 0 && !tiposDelPlan.some(t => t.tipo_clase_id === sesion.tipo_clase_id)) {
        return conCorsWidget(req, NextResponse.json({ error: 'Este plan no cubre el tipo de esta clase' }, { status: 400 }));
      }
      // Apertura suave: mismo criterio que checkout-embebido, antes de cobrar.
      const cierre = await cierreAperturaSuave(admin, body.studioId, socioId, sesion.inicio as string, { planQueCompra: body.planId });
      if (cierre) return conCorsWidget(req, NextResponse.json({ error: MENSAJE_APERTURA_SUAVE(cierre), codigo: 'apertura-suave' }, { status: 409 }));
      // La ventana de reserva (cierre y apertura, también a hora fija): cobrar una
      // clase que aún no se puede reservar —o que ya se cerró— era cobrar sin plaza,
      // porque la reserva tras el pago (`reservarPlazaTrasPagoPublico`) la rechaza.
      const ventana = await comprobarVentanaReserva(admin, { studioId: body.studioId, tipoClaseId: sesion.tipo_clase_id as string | null, inicioISO: sesion.inicio as string });
      if (ventana) return conCorsWidget(req, NextResponse.json({ error: ventana.error, codigo: ventana.codigo }, { status: 409 }));
      // Fase A (P06): una clase con precio propio distinto de su tarifa no se vende online.
      const precioPuntual = sesion.precio_puntual as number | null;
      if (typeof precioPuntual === 'number' && precioPuntual > 0) {
        const { data: planRows } = await admin.from('planes_tarifa').select('*').eq('studio_id', body.studioId);
        const planesEstudio = await hidratarTiposDePlanes(admin as never, body.studioId, ((planRows ?? []) as RowPlanesTarifa[]).map(mapPlanTarifa));
        if (tienePrecioEspecial(precioPuntual, planDeClaseSuelta(planesEstudio, (sesion.tipo_clase_id as string | null) ?? null))) {
          return conCorsWidget(req, NextResponse.json(
            { error: 'Esta clase tiene un precio especial: resérvala en el estudio. No te hemos cobrado nada.', codigo: 'precio-especial' },
            { status: 409 },
          ));
        }
      }
      // ¿Hay plaza para ella? Lo mismo que preguntará la reserva tras pagar, ANTES de reservar
      // matrícula o crear la sesión de Stripe (P06 · Fase A).
      const plazaClase = await comprobarPlazaAntesDeCobrar(admin, {
        studioId: body.studioId, sesionId: body.sesionId, socioId, email: socioEmail, spotId: body.spotId ?? null,
      });
      if (!plazaClase.ok) {
        return conCorsWidget(req, NextResponse.json(
          { error: plazaClase.error, codigo: plazaClase.codigo, ...(plazaClase.posicionEspera != null ? { posicionEspera: plazaClase.posicionEspera } : {}) },
          { status: plazaClase.codigo === 'error' ? 503 : 409 },
        ));
      }
      // La sesión caduca cuando se cierra la reserva: pagada después, no habría plaza.
      const caducidad = caducidadCheckoutDeClase(
        await cierreDeReserva(admin, { studioId: body.studioId, tipoClaseId: sesion.tipo_clase_id as string | null, inicioISO: sesion.inicio as string }),
        Date.now(),
      );
      if (!caducidad.ok) return conCorsWidget(req, NextResponse.json({ error: caducidad.error, codigo: caducidad.codigo }, { status: 409 }));
      expiraPorClase = caducidad.expiresAt;
    }

    // 32ª pasada de auditoría: este camino (Modo A, redirección al Checkout
    // Session hospedado) quedó fuera del trabajo de consentimiento legal de
    // #1756/#1761 — solo tocaron el checkout embebido (Modo B). El webhook
    // YA sabe leer `session.metadata.terminosHash` (y fechar la aceptación con
    // `session.created`) y dejarlos en el recibo (ver `entregarPlanComprado`); simplemente nunca
    // se sellaban aquí, así que quedaban NULL en el 100% de estas compras.
    // Mismo cálculo que `checkout-embebido/route.ts`: el hash lo compone el
    // SERVIDOR a partir de los textos vigentes del estudio, nunca el cliente.
    // Best-effort — si falla, la compra sigue sin sello (igual que Modo B).
    const { sellarCondicionesVigentes } = await import('@/lib/legal-sellado');
    const { exigeAceptacionExplicita } = await import('@/lib/legal-aceptacion');
    // P-2 (auditoría 58ª): sellar sin comprobar nada certificaba un
    // consentimiento que nadie dio -- C-1 ya cerró el hueco del NAVEGADOR
    // (el botón de Bizum no exigía la casilla); esto cierra el del SERVIDOR,
    // que sellaba igual aunque el body llegara sin ninguna prueba. Acotado a
    // los estudios que de verdad reescribieron algo (mismo criterio que ya
    // decide si el checkout PINTA la casilla): los demás siguen igual.
    if (await exigeAceptacionExplicita(admin, body.studioId) && body.aceptaCondiciones !== true) {
      return conCorsWidget(req, NextResponse.json(
        { error: 'Debes aceptar las condiciones del servicio y la política de privacidad.' },
        { status: 409 },
      ));
    }
    const sello = await sellarCondicionesVigentes(admin, body.studioId);
    // Solo la huella. CUÁNDO se aceptaron es `session.created`, y lo lee el
    // webhook (lib/billing/sello-del-cobro.ts): una fecha en la metadata hacía
    // distintos los parámetros de cada petición, y con la misma clave de
    // idempotencia Stripe rechazaba el segundo intento del mismo pago.
    if (sello) metadata.terminosHash = sello.hash;
  } else {
    return conCorsWidget(req, NextResponse.json({ error: 'Falta el recibo o el plan a cobrar' }, { status: 400 }));
  }

  if (!(importe > 0)) {
    return conCorsWidget(req, NextResponse.json({ error: 'Importe no válido' }, { status: 409 }));
  }
  // Por debajo de 0,50 € Stripe no cobra: se dice antes de crear nada (P06).
  if (body.planId && !body.reciboId && importe < IMPORTE_MINIMO_EUR) {
    return conCorsWidget(req, NextResponse.json(
      { error: 'Ese importe es demasiado bajo para pagarlo online. Pide a tu estudio que te lo dé directamente.', codigo: 'importe-minimo' },
      { status: 409 },
    ));
  }
  if (socioId) metadata.socioId = socioId;
  // PAY-3: solo se marca cuando el JWT de esta petición resolvió a la MISMA
  // titular del recibo — nunca a partir de `recibo.socio_id` a secas. El
  // webhook y el conciliador solo guardan la tarjeta del pagador con esta
  // marca presente.
  if (body.reciboId && pagadorVerificado) metadata.pagadorVerificado = '1';
  // Stripe exige valores de metadata como string no vacío.
  if (body.origenLead) metadataVolatil.origenLead = body.origenLead;
  // "Pagar y reservar sin login" con Bizum: el webhook (checkout.session.
  // completed → entregarPlanComprado, y el bloque de reserva justo después)
  // necesita estos mismos campos que ya viaja checkout-embebido — sin ellos
  // aquí, el fallback de Bizum entregaría el plan pero no reservaría la clase
  // ni rellenaría la ficha nueva con lo que la visitante ya escribió.
  if (body.sesionId) metadata.sesionId = body.sesionId;
  // La sesión del widget, para anotar la compra en su embudo al entregarla.
  const widgetSesion = sesionWidgetValida(body.widgetSesion);
  if (widgetSesion) metadataVolatil.widgetSesion = widgetSesion;
  // Solo tiene sentido junto a sesionId — sin sesión no hay reserva a la que
  // asignarle un sitio.
  if (body.sesionId && body.spotId) metadataVolatil.spotId = body.spotId;
  // Teléfono: saneado pero NO bloqueante, mismo criterio que checkout-embebido
  // — un formato raro no puede frenar un cobro legítimo, simplemente no viaja.
  const telefonoCrudo = body.socioTelefono?.trim() ?? '';
  const socioTelefono = telefonoCrudo && telefonoCrudo.length <= 32 && telefonoValido(telefonoCrudo)
    ? telefonoCrudo
    : null;
  if (socioTelefono) metadataVolatil.socioTelefono = socioTelefono;
  if (body.genero) metadataVolatil.genero = body.genero;
  if (body.comoConociste) metadataVolatil.comoConociste = body.comoConociste;
  if (body.codigoPostal) metadataVolatil.codigoPostal = body.codigoPostal;
  if (body.fechaNacimiento) metadataVolatil.fechaNacimiento = body.fechaNacimiento;

  const { data: studio } = await admin
    .from('studios')
    .select('stripe_account_id, slug')
    .eq('id', body.studioId)
    .single();
  if (!studio?.stripe_account_id) {
    return conCorsWidget(req, NextResponse.json({ error: 'Conecta tu cuenta de Stripe desde Configuración → Cobros y facturas antes de cobrar.' }, { status: 409 }));
  }

  // P-1 (auditoría 26ª pasada): la matrícula se cobra la PRIMERA vez que esta
  // socia contrata un plan aquí — nunca sobre el código de descuento (ese es
  // del plan, no de esta venta aparte).
  //
  // Desde la promoción de matrícula (cupo + fecha), el IMPORTE ya no sale del
  // catálogo: lo decide `reservar_matricula` en la base, que además gasta la
  // plaza bajo un `for update`. Aquí solo se cobra lo que diga. Va en el ÚLTIMO
  // punto en que la compra todavía puede fallar sin haber gastado nada: a
  // partir de aquí, el único camino que no crea el cobro es el `catch` — que sí
  // devuelve la plaza.
  if (matriculaBase > 0 && body.planId
      && await primeraVezConPlan(admin, body.studioId, socioId, socioEmail)) {
    const aCobrar = await reservarMatricula(admin, body.planId, body.studioId, matriculaBase);
    matriculaCentimos = Math.round(aCobrar * 100);
    // Solo se anota si se cobra: un 0 en metadata haría que el webhook
    // registrara un recibo de matrícula de cero euros.
    if (matriculaCentimos > 0) metadata.matriculaCentimos = String(matriculaCentimos);
    // La plaza se reserva ANTES de crear el cobro. Si el cobro no llega a
    // existir, esa plaza no se ha usado y tiene que volver.
    if (aCobrar === 0) {
      cupoMatriculaReservado = { planId: body.planId, studioId: body.studioId };
      // P-1 (auditoría 58ª): si la clienta abandona el checkout (nadie paga,
      // la sesión caduca) o Stripe rechaza el cobro, el webhook necesita
      // saber que esta sesión se llevó una plaza gratis para devolverla —
      // sin esto, solo se devolvía si el checkout ni siquiera llegaba a
      // crearse (el `catch` de más abajo), nunca si se creaba y luego nadie
      // pagaba, que es el caso más común. Ver `liberarCupoMatriculaUnaVez`.
      metadata.cupoMatriculaReservado = '1';
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  const slugEstudio = studio.slug as string | null;
  const retorno = urlsDeRetorno({
    // La incrustada vive en la app de la alumna: su vuelta (si un método redirige) es su app.
    origen: incrustado ? 'portal' : parsearOrigenPago(body.origen),
    appUrl,
    slug: slugEstudio,
    esCompraDePlan: !!body.planId && !body.reciboId,
    reciboId: body.reciboId,
    planId: body.planId,
  });

  // R2: take-rate de plataforma (apagado por defecto; ver lib/billing/stripe-fees.ts).
  // Sobre el TOTAL cobrado, matrícula incluida — es la misma venta, un solo cargo.
  const fee = applicationFeeAmount(Math.round(importe * 100) + matriculaCentimos);

  // Bizum no admite `setup_future_usage` (es un pago puntual sin mandato
  // reutilizable), así que durante un tiempo pedir Bizum apagaba el guardado de
  // tarjeta de TODA la sesión — incluido `customer_creation`. El problema es que
  // esa sesión sigue ofreciendo tarjeta: el botón "Pagar con Bizum" del widget
  // manda `bizum: true`, y una socia que allí acabara pagando CON TARJETA no
  // dejaba ni Customer ni PaymentMethod. Después, "Cobrar online" en el panel
  // solo podía decir "La socia no tiene tarjeta ni mandato SEPA guardado".
  //
  // `payment_method_options.card.setup_future_usage` resuelve exactamente esto:
  // el guardado se pide POR MÉTODO, así que la tarjeta se guarda y Bizum no
  // arrastra una opción que no soporta. Ver el webhook
  // (`checkout.session.completed`), que comprueba el método REALMENTE usado
  // antes de guardar nada.
  //
  // ⚠️ El `setup_future_usage` GLOBAL se sigue pidiendo cuando no hay Bizum,
  // aunque el por-método ya lo cubriría. No es redundancia por descuido:
  //
  //   · El camino sin Bizum (portal, panel, /reservar, enlace de pago) YA
  //     funcionaba con el global, y el webhook comprobaba justo ese campo.
  //   · Dejar solo el por-método haría que ese camino que funciona dependa de
  //     que Stripe devuelva `payment_method_options.card.setup_future_usage` en
  //     el PaymentIntent recuperado. Es lo esperable, pero aquí no hay Stripe en
  //     modo test para comprobarlo, y si no lo devolviera se dejarían de guardar
  //     tarjetas en el único camino por el que hoy se guardan.
  //
  // Con Bizum sí va solo el por-método: el global es incompatible con `bizum` y
  // Stripe rechazaría la sesión. Así el camino nuevo gana capacidad sin poner en
  // riesgo el que ya iba, y `metodoReutilizableDe` acepta las dos formas.
  // ⚠️ En una CUOTA (mensual, trimestral, anual) Bizum se ignora aunque se
  // pida: no deja tarjeta guardada, y la renovación del ciclo siguiente no
  // tendría con qué cobrarse sola — la alumna seguiría con su plan sin pagar.
  // Sin `bizum`, la sesión ofrece solo tarjeta y pide el guardado GLOBAL, que es
  // justo lo que la renovación necesita. Es la cerradura; las pantallas además
  // ocultan el botón (lib/billing/bizum-permitido.ts).
  // En la hoja incrustada no va Bizum: exige salir a la app del banco, y la hoja
  // es justo para no salir. Quien quiera Bizum tiene el enlace de siempre.
  const conBizum = !incrustado && ofrecerBizum(body.bizum === true, tipoPlanCobrado);
  // P16: la tarjeta se guarda para cobros automáticos SOLO si hace falta (la cuota). Antes se pedía para todo.
  const guardado = usoFuturoCheckoutHospedado({ tipoPlan: tipoPlanCobrado, esReciboDeRenovacion: reciboEsRenovacion });
  if (guardado.avisar) {
    Sentry.captureMessage('[stripe/checkout] recibo de renovación con el tipo de plan sin saber: se guarda la tarjeta por si acaso', {
      level: 'warning', tags: { area: 'cobros' }, extra: { studioId: body.studioId, reciboId: body.reciboId ?? null },
    });
  }
  // Pedir Bizum sin comprobar que la cuenta CONECTADA lo tiene `active` tumba
  // la sesión ENTERA (Stripe rechaza el `create` si cualquier método pedido
  // no está activo) -- también la tarjeta, que sí funcionaría. Confirmado en
  // producción (2026-09-12): "The payment method type provided: bizum is
  // invalid" dejaba a la alumna sin poder pagar de ninguna forma. Ver
  // lib/billing/bizum-activo.ts.
  if (conBizum && !(await bizumActivo(stripe, studio.stripe_account_id))) {
    // La plaza de matrícula ya está reservada y aquí no nace ningún cobro.
    if (cupoMatriculaReservado) {
      await liberarCupoMatricula(admin, cupoMatriculaReservado.planId, cupoMatriculaReservado.studioId);
    }
    return conCorsWidget(req, NextResponse.json(
      { error: 'Bizum todavía no está disponible para este estudio. Paga con tarjeta mientras tanto.' },
      { status: 409 },
    ));
  }
  const paymentMethodTypes: Array<'card' | 'bizum'> = conBizum ? ['card', 'bizum'] : ['card'];

  // DOBLE COBRO (C-3). Hasta aquí esto solo LEÍA el estado del recibo y creaba
  // la sesión sin escribir nada: un TOCTOU de manual. Dos pestañas —o dos clics
  // separados por minutos— producían DOS sesiones pagables del mismo recibo, y
  // las dos cobraban de verdad. El segundo cargo era además invisible: el
  // webhook lo acota con `.in('estado', [...])`, así que casaba 0 filas y no
  // dejaba rastro en ninguna parte de Tentare.
  //
  // Se reutiliza la sesión que ya esté abierta en vez de crear otra (y de paso
  // la socia recupera su checkout, que es mejor que un error). Si pide otro
  // método de pago, la anterior se EXPIRA antes de crear la nueva: expirada ya
  // no se puede pagar, así que nunca hay dos sesiones cobrables vivas a la vez.
  // M-3 (auditoría 22-sep): también se expira si el IMPORTE cambió. Solo se
  // llega aquí desde la rama de recibo (la única que rellena
  // `sesionAbiertaId`), donde `matriculaCentimos` se queda a 0 — el mismo
  // cálculo que hace el webhook al comprobar el importe cobrado.
  // Quién pide esta sesión y cómo se enseña (hoy siempre la página de Stripe):
  // solo hereda la sesión abierta quien la abrió (ver `decidirSesionCheckout`).
  const peticionCheckout: PeticionCheckout = { modo: incrustado ? 'incrustado' : 'hospedado', pagadorVerificado: !!body.reciboId && pagadorVerificado };
  // Lo que se devuelve de una sesión: el enlace, o lo que monta la app.
  const responderSesion = (sesion: Stripe.Checkout.Session) => {
    if (!incrustado) return conCorsWidget(req, NextResponse.json({ url: sesion.url }));
    const r = respuestaIncrustada(sesion);
    return conCorsWidget(req, r
      ? NextResponse.json(r)
      : NextResponse.json({ error: 'No se pudo iniciar el cobro. Inténtalo de nuevo: no se te ha cobrado nada.' }, { status: 500 }));
  };
  // Un solo «ahora» para la clave y el `expires_at` de la incrustada: los dos salen
  // del mismo minuto, y así dos peticiones del mismo intento mandan lo mismo.
  const ahoraMs = Date.now();
  if (sesionAbiertaId) {
    // ⚠️ Si no se puede revisar ni cerrar la sesión guardada, NO se crea otra
    // (5-oct-2026). Antes un fallo aquí solo se anotaba y se seguía: con la sesión
    // ya pagada y el webhook sin llegar se saltaba el 'ya-pagada', y si la clienta
    // la terminaba justo entre la consulta y el cierre quedaban dos pagables. Mismo
    // criterio que el mostrador (`cerrarPagoOnlineAntesDeCobrarAMano`): sin saberlo,
    // no se cobra. Solo una sesión que no existe en esa cuenta deja seguir.
    const cuentaConnect = studio.stripe_account_id;
    let previa: Stripe.Checkout.Session | null = null;
    try {
      previa = await stripe.checkout.sessions.retrieve(sesionAbiertaId, undefined, { stripeAccount: cuentaConnect });
    } catch (err) {
      if (!sesionNoExisteEnStripe(err)) {
        console.error('[stripe/checkout] no se pudo revisar la sesión previa', sesionAbiertaId, err);
        if (cupoMatriculaReservado) {
          await liberarCupoMatricula(admin, cupoMatriculaReservado.planId, cupoMatriculaReservado.studioId);
        }
        return conCorsWidget(req, NextResponse.json({ error: MENSAJE_SESION_PREVIA_SIN_COMPROBAR }, { status: 503 }));
      }
    }
    if (previa) {
      const decision = decidirSesionCheckout(previa, paymentMethodTypes, Math.round(importe * 100), peticionCheckout);
      if (decision === 'reutilizar' && (incrustado ? previa.client_secret : previa.url)) {
        return responderSesion(previa);
      }
      // Ya se pagó por esa sesión y el recibo aún no consta cobrado (el webhook
      // no ha llegado, o lo rechazó): otra sesión sería cobrarlo dos veces.
      if (decision === 'ya-pagada') {
        return conCorsWidget(req, NextResponse.json({ error: MENSAJE_RECIBO_YA_PAGADO_ONLINE }, { status: 409 }));
      }
      if (decision === 'expirar-y-crear') {
        // Cerrar, y volver a mirar si no se deja: lo normal es que la acaben de pagar.
        const cierre = await cerrarPagoOnlineAntesDeCobrarAMano(previa.id, {
          consultar: id => stripe.checkout.sessions.retrieve(id, undefined, { stripeAccount: cuentaConnect }),
          cerrar: id => stripe.checkout.sessions.expire(id, undefined, { stripeAccount: cuentaConnect }),
        });
        if (cierre.tipo === 'YA_PAGADO') {
          return conCorsWidget(req, NextResponse.json({ error: MENSAJE_RECIBO_YA_PAGADO_ONLINE }, { status: 409 }));
        }
        if (cierre.tipo === 'NO_SE_SABE') {
          return conCorsWidget(req, NextResponse.json({ error: MENSAJE_SESION_PREVIA_SIN_COMPROBAR }, { status: 503 }));
        }
      }
    }
  }

  // D-3 (auditoría 20-ago): clave de idempotencia también para la compra de
  // PLAN. Antes existía solo para recibos y dos pestañas del mismo intento eran
  // dos `cs_` pagables → dos cargos, dos recibos COBRADOS y dos suscripciones,
  // sin que nada lo detectara. Misma regla que el checkout embebido (Modo B),
  // con prefijo y componentes propios — el porqué de cada diferencia está en
  // `lib/billing/clave-checkout-embebido.ts`. Devuelve null sin identidad
  // (endpoint semipúblico, el email no está garantizado): en ese caso se queda
  // el comportamiento de antes en vez de arriesgar una colisión entre personas.
  const clavePlan = !body.reciboId && body.planId
    ? claveCheckoutPlanModoA({
        studioId: body.studioId,
        planId: body.planId,
        socioId,
        socioEmail,
        codigoDescuentoId: metadata.codigoDescuentoId ?? null,
        metodos: paymentMethodTypes,
        sesionId: body.sesionId ?? null,
      })
    : null;

  // Cupo EXACTO de una etapa de lanzamiento «Cerrar la venta» (Opening OS): la
  // plaza se reserva bajo lock ANTES de crear el cobro, con la misma clave del
  // intento. null = el plan no tiene cupo ahora y la compra sigue como siempre.
  let plaza: PlazaReservada | null = null;
  if (!body.reciboId && body.planId) {
    try {
      await recuperarPlazasCaducadas(admin, stripe, body.planId, body.studioId, studio.stripe_account_id);
      plaza = await reservarPlazaEtapa(admin, body.planId, body.studioId, clavePlan ?? `cs-${globalThis.crypto.randomUUID()}`);
    } catch (err) {
      if (cupoMatriculaReservado) {
        await liberarCupoMatricula(admin, cupoMatriculaReservado.planId, cupoMatriculaReservado.studioId);
      }
      if (esEtapaAgotada(err)) {
        return conCorsWidget(req, NextResponse.json({ error: MENSAJE_ETAPA_AGOTADA }, { status: 409 }));
      }
      return conCorsWidget(req, errorInterno('stripe/checkout:plaza', err, 'No se pudo iniciar el cobro. Inténtalo de nuevo.'));
    }
    // Volátil: si la etapa empieza entre dos peticiones del mismo intento, la plaza
    // se liga por su referencia (`asignarRefPlaza`), no por la creación.
    if (plaza) metadataVolatil.plazaEtapaId = plaza.id;
  }

  // La matrícula gratis de una sesión que ya existe con la marca y se cierra aquí: con
  // la clave de ESA sesión, la misma del conciliador (`plazaDeSesionCaducada`).
  const devolverMatriculaDeSesion = async (sessionId: string) => {
    if (!cupoMatriculaReservado) return;
    try {
      await liberarCupoMatriculaUnaVez(admin, sessionId, cupoMatriculaReservado.planId, cupoMatriculaReservado.studioId);
    } catch (e) {
      // Nada anotado: el conciliador la devuelve al verla caducada.
      Sentry.captureException(e instanceof Error ? e : new Error('liberar matrícula de la sesión cerrada'), {
        level: 'warning', tags: { area: 'stripe-checkout', tipo: 'matricula' }, extra: { studioId: body.studioId, sessionId },
      });
    }
  };

  try {
    const parametrosSesion: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      payment_method_types: paymentMethodTypes,
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: concepto,
              // En la compra de un plan, sin el nombre: es del formulario, y con la
              // misma clave de idempotencia corregirlo daba `idempotency_error`. La
              // ficha saca el nombre de lo que Stripe recoge (`customer_details`).
              description: body.reciboId && body.socioNombre ? `Tentare · ${body.socioNombre}` : 'Tentare',
            },
            unit_amount: Math.round(importe * 100),
          },
          quantity: 1,
        },
        // P-1: línea APARTE para la matrícula — Stripe Checkout ya la
        // desglosa sola en su propia pantalla de pago, sin tocar nada de UI.
        ...(matriculaCentimos > 0 ? [{
          price_data: {
            currency: 'eur' as const,
            product_data: { name: `Matrícula — ${concepto}` },
            unit_amount: matriculaCentimos,
          },
          quantity: 1,
        }] : []),
      ],
      customer_email: socioEmail ?? undefined,
      // Siempre: sin Customer no hay dónde adjuntar la tarjeta, y esto vale
      // igual cuando se paga por Bizum (el Customer se queda sin método
      // reutilizable, que es lo correcto, en vez de no existir).
      customer_creation: 'always' as const,
      // Guardado POR MÉTODO: la tarjeta sí, Bizum no lo admite. Es lo que
      // permite ofrecer Bizum y seguir pudiendo cobrar después.
      // P16: solo cuando hay un cargo futuro (`usoFuturoCheckoutHospedado`).
      ...(guardado.usoFuturo ? { payment_method_options: { card: { setup_future_usage: guardado.usoFuturo } } } : {}),
      payment_intent_data: {
        // Y el global cuando no hay Bizum, para no cambiar en nada el camino que
        // ya funcionaba (ver el comentario largo más arriba).
        ...(conBizum || !guardado.usoFuturo ? {} : { setup_future_usage: guardado.usoFuturo }),
        ...(fee !== undefined ? { application_fee_amount: fee } : {}),
        // El handler `charge.refunded` lee la metadata del PAYMENT INTENT, no de la
        // session (Stripe no la copia). Sin el reciboId aquí, una devolución o
        // contracargo de un pago por enlace/Bizum NO marcaba el recibo DEVUELTO y se
        // quedaba COBRADO para siempre (ingresos inflados). Solo para recibos reales.
        ...(body.reciboId ? { metadata: { reciboId: body.reciboId, origen: 'tarjeta_recibo', studioId: body.studioId } } : {}),
      },
      metadata,
      ...(incrustado ? {
        // La app: Stripe pinta el pago DENTRO de la hoja. Con tarjeta no sale de la
        // app (`if_required`); solo un método con redirección vuelve a `return_url`,
        // que lleva el recibo para que la pantalla COMPRUEBE antes de afirmar nada.
        ui_mode: 'embedded_page' as const,
        redirect_on_completion: 'if_required' as const,
        return_url: `${retorno.successUrl}&session_id={CHECKOUT_SESSION_ID}`,
        // 31 min desde el minuto de la clave (`expiraSesionIncrustada`): abandonada,
        // caduca pronto y el conciliador suelta el recibo para su cobro de siempre.
        expires_at: expiraSesionIncrustada(ahoraMs),
      } : {
        // A dónde vuelve la persona: lo resuelve `urlsDeRetorno` a partir de
        // `origen` (lista blanca) + si es compra de plan. Antes esto asumía que
        // todo lo que llevara `reciboId` lo iniciaba el estudio desde su panel, y
        // dejaba a la socia que paga desde el portal en el login del staff.
        success_url: retorno.successUrl,
        cancel_url: retorno.cancelUrl,
      }),
      locale: 'es',
      // Con plaza reservada la sesión caduca con ella (31 min): así Stripe
      // confirma el abandono con `checkout.session.expired` y la plaza vuelve.
      // Sale de la plaza, no de Date.now(): un reintento del mismo intento
      // manda los mismos parámetros y la idempotencia de Stripe no protesta.
      ...(plaza ? { expires_at: Math.floor(new Date(plaza.expiraEn).getTime() / 1000) } : {}),
      // Con clase concreta y sin plaza de etapa: caduca al cerrarse la reserva de la clase
      // (`caducidadCheckoutDeClase`, de la clase y no del reloj: misma clave, mismos parámetros).
      ...(!plaza && !incrustado && expiraPorClase ? { expires_at: expiraPorClase } : {}),
    };
    // Cinturón además de los tirantes: la reutilización de arriba no cubre la
    // carrera de dos peticiones que entran ANTES de que ninguna haya llegado a
    // guardar `checkout_session_id`. Con la misma clave, Stripe devuelve la
    // sesión que ya creó en vez de crear otra. Lleva los métodos de pago
    // porque cambiarlos sí exige una sesión distinta, y con la misma clave y
    // parámetros distintos Stripe respondería un error de idempotencia.
    //
    // Para la compra de un plan, `clavePlan` (D-3): la afirmación que vivía
    // aquí —"no hay un id estable con el que construir una clave que no
    // colisione entre personas"— dejó de ser cierta cuando el Modo B lo
    // resolvió identificando el INTENTO (persona hasheada + plan + descuento
    // + ventana), y quedó sin aplicar en este camino.
    const claveSesion: string | null = body.reciboId
      // PAY-3: la clave lleva TAMBIÉN el importe. Sin él, el camino
      // `expirar-y-crear` por cambio de importe (M-3) pedía la sesión nueva
      // con la clave vieja y parámetros distintos, Stripe lo rechazaba y el
      // recibo quedaba impagable ~24 h con la sesión anterior ya expirada.
      ? claveCheckoutRecibo(body.reciboId, paymentMethodTypes, Math.round(importe * 100), peticionCheckout, ahoraMs)
      : clavePlan
        // Con plaza de cupo, la clave lleva su intento: un intento liberado y
        // vuelto a reservar necesita otra sesión, no la caducada.
        ? (plaza ? claveStripe(clavePlan, plaza.intento) : clavePlan)
        : null;
    const crearSesion = (clave: string | null) => stripe.checkout.sessions.create(parametrosSesion, {
      stripeAccount: studio.stripe_account_id,
      ...(clave ? { idempotencyKey: clave } : {}),
    });
    // Cada repetición de Stripe (la de la clave y la de cada clave derivada) se mira
    // contra la sesión de AHORA: nunca se devuelve la URL de una sesión caducada o
    // ya pagada sin su `retrieve`.
    let session: Stripe.Checkout.Session = await crearSesion(claveSesion);
    // ¿La creó ESTA petición, o es la repetición de otra con la misma clave?
    let creadaAqui = !esRespuestaRepetida(session);
    let claveActual = claveSesion;
    for (let vuelta = 0; !creadaAqui && claveActual && vuelta < 4; vuelta++) {
      let actual: Stripe.Checkout.Session | null = null;
      try {
        actual = await stripe.checkout.sessions.retrieve(session.id, undefined, { stripeAccount: studio.stripe_account_id });
      } catch (errActual) {
        console.error('[stripe/checkout] no se pudo mirar la sesión repetida', session.id, errActual);
      }
      const repetida = queHacerConSesionRepetida(actual);
      if (repetida === 'usar' && actual) { session = actual; break; }
      if (repetida === 'nueva' && vuelta < 3) {
        // Caducada: este mismo intento necesita otra, con una clave que no la repita.
        claveActual = claveTrasSesion(claveActual, session.id);
        session = await crearSesion(claveActual);
        creadaAqui = !esRespuestaRepetida(session);
        continue;
      }
      // Ya pagada, o sin poder saberlo: ni se devuelve su URL ni se crea otra. La
      // plaza de cupo es la de esa sesión (misma clave): no se suelta. La de
      // matrícula gratis la reservó esta petición para sí: vuelve.
      if (cupoMatriculaReservado) {
        await liberarCupoMatricula(admin, cupoMatriculaReservado.planId, cupoMatriculaReservado.studioId);
      }
      if (repetida === 'pagada' && !body.reciboId && body.sesionId && actual) {
        // Con clase: lo que de verdad tiene (lib/billing/pago-anterior.ts), no una
        // confirmación que puede no llegar.
        return conCorsWidget(req, NextResponse.json({ error: await mensajeDeClasePagadaPorSesion(admin, actual, body.studioId), codigo: 'ya-pagado' }, { status: 409 }));
      }
      return conCorsWidget(req, repetida === 'pagada'
        ? NextResponse.json({ error: body.reciboId ? MENSAJE_RECIBO_YA_PAGADO_ONLINE : MENSAJE_COMPRA_YA_PAGADA, codigo: 'ya-pagado' }, { status: 409 })
        : NextResponse.json({ error: MENSAJE_SESION_PREVIA_SIN_COMPROBAR }, { status: 503 }));
    }

    // La plaza queda ligada a ESTE cobro. Si no se puede guardar, no hay forma
    // de confirmarla ni de soltarla después: se deshace la venta entera.
    // Una sesión que no creó esta petición no se toca: es la de otra pestaña.
    if (plaza && !(await asignarRefPlaza(admin, plaza.id, session.id))) {
      if (creadaAqui) {
        let expirada = false;
        try {
          const e = await stripe.checkout.sessions.expire(session.id, undefined, {
            stripeAccount: studio.stripe_account_id, idempotencyKey: `checkout-expirar-${session.id}`,
          });
          expirada = e.status === 'expired';
        } catch (errExpirar) {
          Sentry.captureException(errExpirar instanceof Error ? errExpirar : new Error('No se pudo expirar la sesión de Checkout'), {
            tags: { area: 'stripe-checkout' }, extra: { sessionId: session.id, studioId: body.studioId, motivo: 'plaza_sin_ref' },
          });
        }
        if (expirada) {
          // La plaza, solo si no es de OTRA sesión (sigue pagable); la matrícula, con
          // la clave de esta sesión: la misma con la que la devolvería el conciliador.
          await liberarPlazaSiEsDe(admin, plaza.id, session.id);
          await devolverMatriculaDeSesion(session.id);
        }
      } else if (cupoMatriculaReservado) {
        await liberarCupoMatricula(admin, cupoMatriculaReservado.planId, cupoMatriculaReservado.studioId);
      }
      return conCorsWidget(req, NextResponse.json({ error: 'No se pudo iniciar el cobro. Inténtalo de nuevo.' }, { status: 500 }));
    }

    // Mismo intento que ya creó esta sesión (`clavePlan`: doble clic, dos
    // pestañas): Stripe devuelve la de antes y esta petición no ha creado nada,
    // pero SÍ ha reservado otra plaza de matrícula gratis, que no usará nadie.
    // (La matrícula solo se reserva en compras de plan, nunca con `reciboId`,
    // así que el bloque de abajo no puede devolverla otra vez.) Si la repetida
    // había caducado y esta petición creó otra (`creadaAqui`), la plaza va con ella.
    if (cupoMatriculaReservado && !creadaAqui) {
      await liberarCupoMatricula(admin, cupoMatriculaReservado.planId, cupoMatriculaReservado.studioId);
    }

    // Lo volátil, DESPUÉS de crear y antes de devolver la URL: nadie paga esta
    // sesión sin estos datos. En una compartida (otra pestaña del mismo intento)
    // gana lo último que se escribe.
    if (Object.keys(metadataVolatil).length > 0) {
      try {
        await stripe.checkout.sessions.update(session.id, { metadata: recortarMetadata(metadataVolatil) }, { stripeAccount: studio.stripe_account_id });
      } catch (errDatos) {
        if (creadaAqui) {
          // Sin el teléfono o el sitio, la ficha y la reserva saldrían mal: esta
          // sesión no se entrega. Se cierra y se devuelve lo retenido.
          // Con las claves de ESTA sesión: la plaza por su referencia y la matrícula
          // «una vez». Sin clave, el conciliador la devolvía otra vez al verla caducada.
          try {
            const e = await stripe.checkout.sessions.expire(session.id, undefined, {
              stripeAccount: studio.stripe_account_id, idempotencyKey: `checkout-expirar-${session.id}`,
            });
            if (e.status === 'expired') {
              if (plaza) await liberarPlazaPorRef(admin, session.id);
              await devolverMatriculaDeSesion(session.id);
            }
          } catch (errExpirar) {
            console.error('[stripe/checkout] no se pudo cerrar la sesión sin datos', session.id, errExpirar);
          }
          return conCorsWidget(req, errorInterno('stripe/checkout:datos', errDatos, 'No se pudo iniciar el cobro. Inténtalo de nuevo.'));
        }
        // La de otra pestaña ya lleva los datos con los que se creó.
        Sentry.captureException(errDatos instanceof Error ? errDatos : new Error('actualizar datos de la sesión'), {
          level: 'warning', tags: { area: 'stripe-checkout', tipo: 'datos-sesion' }, extra: { studioId: body.studioId, sessionId: session.id },
        });
      }
    }

    // Se registra ANTES de devolver la URL. Si esto fallara y devolviéramos la
    // sesión igualmente, quedaría una sesión pagable que Tentare no conoce — y
    // la siguiente petición crearía otra: exactamente el bug que cierra esto.
    // Regla de la casa: cero escritura optimista en el camino del dinero.
    if (body.reciboId) {
      let guardar = admin
        .from('recibos')
        .update({ checkout_session_id: session.id })
        .eq('id', body.reciboId)
        .eq('studio_id', body.studioId)
        // Ni con un cobro con tarjeta guardada en vuelo (empezó tras la lectura de arriba).
        .is('cobro_off_session_clave', null)
        // Lo que se comprobó arriba, otra vez en el propio UPDATE: que siga
        // siendo deuda (la misma regla que `esReciboCobrable`, menos el
        // `importe_devuelto >= importe`, que PostgREST no compara), y que la sesión
        // guardada siga siendo la que se leyó: si otra petición (otra pestaña, el
        // enlace del email y la app a la vez) guardó la suya entre medias, esta no la
        // pisa —quedarían dos sesiones pagables y Tentare solo conocería una—.
        .in('estado', [...ESTADOS_COBRABLES])
        .is('reembolso_stripe_id', null)
        .is('reembolso_solicitado_en', null)
        .or('estado.neq.DEVUELTO,importe_devuelto.eq.0');
      // Ni con un cobro de la Caja distinto del leído (se empezó tras la lectura de arriba).
      // El leído estaba muerto: si entre medias alguien lo soltó, tampoco es un cobro nuevo.
      guardar = cobroCajaLeido
        ? guardar.or(`cobro_mostrador_pi.is.null,cobro_mostrador_pi.eq."${cobroCajaLeido}"`)
        : guardar.is('cobro_mostrador_pi', null);
      // …o ya es ESTA misma: dos peticiones del mismo intento reciben de Stripe la
      // misma sesión, y la segunda en escribir no puede tomarla por otra.
      guardar = exigirSesionLeidaOEsta(guardar, sesionAbiertaId, session.id);
      const { data: guardadas, error: errGuardar } = await guardar.select('id');
      // Sin error pero sin tocar ninguna fila: el recibo ya no existe (se borró
      // entre la lectura de arriba y aquí, p. ej. el de una penalización que se
      // decidió no cobrar), o se está cobrando con su tarjeta guardada o en la Caja.
      // Devolver la URL sería abrir un pago de algo que Tentare ya no tiene, o un
      // segundo cobro.
      const reciboDesaparecido = !errGuardar && (guardadas?.length ?? 0) === 0;
      if (reciboDesaparecido) {
        // Antes de caducar nada: si la sesión guardada ya es ESTA (la guardó la otra
        // petición del mismo intento), es la buena y se devuelve.
        const { data: ahora } = await admin.from('recibos').select('checkout_session_id')
          .eq('id', body.reciboId).eq('studio_id', body.studioId).maybeSingle();
        if (ahora?.checkout_session_id === session.id) {
          return responderSesion(session);
        }
      }
      if (errGuardar || reciboDesaparecido) {
        if (errGuardar) console.error('[stripe/checkout] no se pudo registrar la sesión', session.id, errGuardar);
        try {
          await stripe.checkout.sessions.expire(session.id, undefined, {
            stripeAccount: studio.stripe_account_id,
            idempotencyKey: `checkout-expirar-${session.id}`,
          });
        } catch (errExpirar) {
          // Queda viva una sesión pagable que Tentare no conoce: que se vea. Solo ids.
          Sentry.captureException(
            errExpirar instanceof Error ? errExpirar : new Error('No se pudo expirar la sesión de Checkout'),
            {
              tags: { area: 'stripe-checkout' },
              extra: {
                sessionId: session.id, reciboId: body.reciboId, studioId: body.studioId,
                motivo: reciboDesaparecido ? 'recibo_desaparecido' : 'no_se_pudo_registrar',
              },
            },
          );
        }
        // La compra no sigue adelante: la plaza de matrícula gratis vuelve.
        if (cupoMatriculaReservado) {
          await liberarCupoMatricula(admin, cupoMatriculaReservado.planId, cupoMatriculaReservado.studioId);
        }
        return conCorsWidget(req, reciboDesaparecido
          ? NextResponse.json({ error: 'Este recibo ya no está pendiente de cobro, o se está cobrando ahora mismo.' }, { status: 409 })
          : NextResponse.json({ error: 'No se pudo iniciar el cobro. Inténtalo de nuevo.' }, { status: 500 }));
      }
    }

    return responderSesion(session);
  } catch (err) {
    // Stripe ya tiene una sesión con ESTA clave y otros parámetros: el mismo
    // intento reabierto con datos distintos. Esa sesión sigue viva y la plaza de
    // cupo es la suya (misma clave): no se suelta. Solo vuelve la plaza de
    // matrícula gratis que esta petición reservó para sí. Ver
    // lib/billing/pago-en-curso.ts.
    if (esErrorDeIdempotencia(err)) {
      if (cupoMatriculaReservado) {
        await liberarCupoMatricula(admin, cupoMatriculaReservado.planId, cupoMatriculaReservado.studioId);
      }
      // La plaza de cupo solo si ninguna sesión la tiene: si la etapa empezó entre
      // las dos peticiones, la de antes se creó sin plaza (y sin `expires_at`, por eso
      // los parámetros ya no coinciden): retenerla 31 min no servía a nadie.
      if (plaza) await liberarPlazaSinCobro(admin, plaza.id);
      Sentry.captureMessage('[stripe/checkout] el mismo intento de pago volvió con otros parámetros', {
        level: 'warning', tags: { area: 'stripe-checkout', tipo: 'pago-en-curso' },
        extra: { studioId: body.studioId, conRecibo: !!body.reciboId, conClase: !!body.sesionId, conPlaza: !!plaza },
      });
      return conCorsWidget(req, NextResponse.json({ error: MENSAJE_PAGO_EN_CURSO, codigo: CODIGO_PAGO_EN_CURSO }, { status: 409 }));
    }
    // Si el cobro no llegó a nacer, la plaza que se reservó para decidir su
    // precio no se ha usado. Devolverla antes de contestar el error (si una sesión
    // anterior ya la tiene ligada, es suya y no se toca).
    if (plaza) await liberarPlazaSinCobro(admin, plaza.id);
    if (cupoMatriculaReservado) {
      await liberarCupoMatricula(admin, cupoMatriculaReservado.planId, cupoMatriculaReservado.studioId);
    }
    return conCorsWidget(req, errorInterno('stripe/checkout:POST', err, 'No se pudo iniciar el cobro. Inténtalo de nuevo más tarde.'));
  }
}

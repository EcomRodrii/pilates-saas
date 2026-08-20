import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { respuestaPreflightWidget, conCorsWidget } from '@/lib/cors-widget';
import { idsDe } from '@/lib/billing/entregar-plan-comprado';
import { EVENTOS } from '@/lib/notifications/catalog';
import { emailsCoinciden, resolverEstadoPago, type RespuestaEstadoPago } from '@/lib/billing/estado-pago-publico';

// P1-3 — estado REAL de la reserva tras «pagar y reservar sin login» (Modo A).
//
// Tras confirmar el PaymentIntent, la reserva la crea el WEBHOOK
// (app/api/stripe/webhook, rama plan_web_embebido → reservarPlazaTrasPagoPublico,
// best-effort): el paso 'done' de /reservar/[slug] hace polling aquí para
// poder decir «tu plaza está confirmada» solo cuando LO ESTÁ, en vez de
// quedarse en «estamos confirmando» sin respuesta jamás.
//
// SOLO LECTURA sobre el camino del dinero: este endpoint no crea ni toca
// nada — lee las filas que el webhook ya persiste con ids DERIVADOS del
// PaymentIntent (idsDe(): recibo `rec-web-…`, reserva `res-web-…`).
//
// Identificación sin sesión: ?pi=<paymentIntentId>&email=<email> — ambos los
// tiene ya el cliente (el pi sale del clientSecret; el email es el del paso
// 'datos'). El email debe coincidir con el de la ficha del recibo: un pi
// ajeno, un email que no corresponde o un pi inexistente reciben TODOS la
// misma respuesta neutra 'en_proceso' — nunca se filtra si un pago o un
// email existen.
//
// Detección de 'fallida': cuando reservarPlazaTrasPagoPublico devuelve
// !ok, el webhook NO deja fila en `reservas` — la única traza consultable es
// la notificación RESERVA_PAGADA_SIN_PLAZA que emite al mostrador
// (emitirReservaPagadaSinPlaza → tabla `notification`). Es best-effort
// también en origen (si publish fallara, o el fallo fuera una excepción
// capturada en vez de un !ok, no hay fila): en esos restos el cliente agota
// el techo del polling y muestra el copy honesto de «tardando», que cubre
// exactamente ese hueco.

export async function OPTIONS(req: NextRequest) {
  return respuestaPreflightWidget(req);
}

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function respuesta(req: NextRequest, body: RespuestaEstadoPago) {
  return conCorsWidget(req, NextResponse.json(body, { headers: NO_STORE }));
}

export async function GET(req: NextRequest) {
  // El polling legítimo hace ~8 peticiones en ~35s por pago; 30/min deja
  // margen a un reintento sin abrir la puerta a enumerar PaymentIntents.
  const limited = await enforceRateLimit(req, 'estado-pago', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const pi = req.nextUrl.searchParams.get('pi') ?? '';
  const email = req.nextUrl.searchParams.get('email') ?? '';
  // Forma de id de PaymentIntent (pi_ + alfanumérico, con test_/live_
  // opcional que idsDe() ya sabe recortar). Cualquier otra cosa ni toca BD.
  if (!/^pi_(test_|live_)?[A-Za-z0-9]{8,64}$/.test(pi) || !email.trim()) {
    return respuesta(req, { estado: 'en_proceso' });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return respuesta(req, { estado: 'en_proceso' });

  const ids = idsDe(pi);

  // 1. El recibo que entregarPlanComprado crea al procesar el webhook — con
  //    el PaymentIntent verificado también por columna, no solo por el id
  //    derivado. Sin recibo, el webhook no ha llegado (o el pi es ajeno):
  //    respuesta neutra.
  const { data: recibo } = await admin
    .from('recibos')
    .select('studio_id, socio_id, fecha_cobro')
    .eq('id', ids.reciboId)
    .eq('stripe_payment_intent_id', pi)
    .maybeSingle();
  if (!recibo?.studio_id || !recibo.socio_id) return respuesta(req, { estado: 'en_proceso' });
  const studioId = recibo.studio_id as string;
  const socioId = recibo.socio_id as string;

  // Si la URL trae studioId (obligatorio para CORS desde el bundle), tiene
  // que ser EL del recibo — defensa extra, misma respuesta neutra.
  const studioIdParam = req.nextUrl.searchParams.get('studioId');
  if (studioIdParam && studioIdParam !== studioId) return respuesta(req, { estado: 'en_proceso' });

  // 2. La guardia de identidad: el email tiene que ser el de la ficha del
  //    recibo. Mismo 'en_proceso' neutro si no coincide — no se filtra nada.
  const { data: socio } = await admin
    .from('socios')
    .select('email')
    .eq('id', socioId)
    .eq('studio_id', studioId)
    .maybeSingle();
  if (!emailsCoinciden(email, socio?.email as string | null | undefined)) {
    return respuesta(req, { estado: 'en_proceso' });
  }

  // 3. La reserva derivada del MISMO PaymentIntent (res-web-…), acotada a
  //    estudio y socia propios.
  const { data: reserva } = await admin
    .from('reservas')
    .select('estado, sesion_id')
    .eq('id', ids.reservaId)
    .eq('studio_id', studioId)
    .eq('socio_id', socioId)
    .maybeSingle();

  // 4. Sin reserva: ¿dejó el webhook el aviso de «pagó y no hubo plaza» al
  //    mostrador? Acotado a este estudio, esta socia y a partir del cobro
  //    (menos un margen por relojes) para no confundirlo con un aviso viejo
  //    de otra compra.
  let avisoSinPlaza = false;
  if (!reserva) {
    const desde = recibo.fecha_cobro
      ? new Date(new Date(recibo.fecha_cobro as string).getTime() - 5 * 60_000).toISOString()
      : new Date(Date.now() - 60 * 60_000).toISOString();
    const { data: aviso } = await admin
      .from('notification')
      .select('id')
      .eq('studio_id', studioId)
      .eq('event_type', EVENTOS.RESERVA_PAGADA_SIN_PLAZA)
      .contains('data', { socioId })
      .gte('created_at', desde)
      .limit(1);
    avisoSinPlaza = Boolean(aviso && aviso.length > 0);
  }

  const estado = resolverEstadoPago(reserva?.estado as string | null | undefined, avisoSinPlaza);
  if (estado === 'en_proceso' || estado === 'fallida') return respuesta(req, { estado });

  // Con reserva (confirmada / lista de espera / pendiente): los datos de la
  // clase PROPIA para que la pantalla los enseñe con la respuesta real.
  let clase: RespuestaEstadoPago['clase'];
  if (reserva?.sesion_id) {
    const { data: ses } = await admin
      .from('sesiones')
      .select('inicio, tipo_clase_id')
      .eq('id', reserva.sesion_id as string)
      .eq('studio_id', studioId)
      .maybeSingle();
    if (ses?.inicio) {
      let nombre = 'Tu clase';
      if (ses.tipo_clase_id) {
        const { data: tipo } = await admin
          .from('tipos_clase')
          .select('nombre')
          .eq('id', ses.tipo_clase_id as string)
          .maybeSingle();
        if (tipo?.nombre) nombre = tipo.nombre as string;
      }
      clase = { nombre, inicio: ses.inicio as string };
    }
  }

  return respuesta(req, { estado, clase });
}

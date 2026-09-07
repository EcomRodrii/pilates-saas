// ─────────────────────────────────────────────────────────────────────────────
// F-12/F-13 (rediseño de fondo, no un parche): punto ÚNICO de "un recibo pagado
// por Checkout Session se acaba de cobrar de verdad". Antes esto vivía
// duplicado, casi carácter por carácter, en dos sitios:
//
//   1. app/api/stripe/webhook/route.ts — camino principal, en tiempo real.
//   2. lib/inngest/conciliar-cobros.ts — red de recuperación cuando el
//      webhook falla (F-12: desde que el webhook responde 200 ANTES de
//      procesar, esta es la ÚNICA red real).
//
// Cada vez que uno ganaba una pieza nueva (guardar el PaymentIntent, sellar
// factura), el otro se quedaba atrás — es el mismo patrón "gemelos
// divergentes" que la 20ª auditoría señala como la causa estructural
// dominante del repo (F-1, F-4, F-5, F-10, F-16 son la misma clase de fallo).
// Ambos llamadores pasan a llamar aquí; lo que sigue siendo suyo es todo lo
// que necesita el objeto vivo de Stripe (verificar importe, detectar Bizum
// vs tarjeta, listar sesiones/PaymentIntents) — eso no se puede compartir sin
// atar este módulo a la forma de un solo llamador.
//
// El camino de SEPA/tarjeta guardada (confirmarCobroExitoso, dunning-server.ts)
// NO pasa por aquí: ese YA era una función única compartida por su webhook y
// su cron — nunca tuvo el problema de los gemelos divergentes. Se deja tal
// cual; solo se le añade el mismo campo de conciliación (ver esa función).
//
// Orden fijo, el mismo para cualquier llamador: marcar cobrado → renovar/
// entregar → sellar factura (best-effort, NUNCA deshace el cobro si falla) →
// marcar conciliado. Un fallo de sellado dedica una tarea aparte
// (`factura_pendiente_sellar`) que el conciliador horario reintenta sobre
// cobros RECIENTES — nunca retroactivo sin límite: sellar HOY una factura de
// hace semanas tiene implicación fiscal real (en qué trimestre se declara),
// y eso lo decide una persona, no un cron.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { aplicarRenovacionServidor } from './renovacion-server.ts';
import { sellarFacturaDeRecibo } from './sellar-factura-server.ts';
import { hoyEnEstudio } from '../utils.ts';
import { ESTADOS_COBRABLES } from './deuda-recibo.ts';

export type FuenteConfirmacion = 'webhook' | 'conciliador';

export type ResultadoConfirmarCobroRecibo =
  | {
      ok: true;
      /**
       * `false` = 0 filas tocadas por el UPDATE: reentrega del mismo evento,
       * o el recibo ya no estaba en un estado cobrable (ya COBRADO o
       * DEVUELTO). No es un fallo — pero el llamador puede querer saberlo
       * (p. ej. para no repetir un log de "recuperado" sobre algo que el
       * webhook ya había aplicado segundos antes).
       */
      actualizado: boolean;
    }
  | { ok: false; error: string };

/**
 * Confirma el cobro de un recibo pagado por Checkout Session (portal, enlace
 * público, widget embebido). Idempotente: una reentrega del mismo evento, o
 * el conciliador llegando después de que el webhook ya lo aplicó, no repite
 * ningún efecto — el `.in('estado', ...)` deja fuera COBRADO y DEVUELTO.
 */
export async function confirmarCobroRecibo(
  admin: SupabaseClient,
  params: {
    studioId: string;
    reciboId: string;
    metodoCobro: string;
    /** El cargo real, para poder devolverlo desde el panel. Solo se escribe si viene. */
    paymentIntentId: string | null;
    fuente: FuenteConfirmacion;
  },
): Promise<ResultadoConfirmarCobroRecibo> {
  const { studioId, reciboId, metodoCobro, paymentIntentId, fuente } = params;
  const ahoraISO = new Date().toISOString();
  // P-9 (auditoría 21ª pasada): `fecha_cobro` es `date`, no `timestamptz` como
  // `conciliado_en` — con `ahoraISO` un cobro a la 01:30 de Madrid se fechaba
  // el día anterior (mismo bug que ya documenta `hoyEnEstudio`).
  const hoy = hoyEnEstudio(new Date(ahoraISO));

  const { data: marcado, error } = await admin
    .from('recibos')
    .update({
      estado: 'COBRADO', fecha_cobro: hoy, metodo_cobro: metodoCobro,
      ...(paymentIntentId ? { stripe_payment_intent_id: paymentIntentId } : {}),
      // Pagado: deja de haber una sesión abierta que reutilizar.
      checkout_session_id: null,
      conciliado_en: ahoraISO, conciliado_por: fuente,
    })
    // Acotado al tenant y a los estados realmente cobrables. Queda fuera
    // COBRADO, para no reescribir `fecha_cobro` con un evento tardío o
    // duplicado.
    //
    // ⚠️ 26ª pasada, corrección de A-1. Aquí faltaba `DEVUELTO`, y el motivo
    // escrito («para no resucitar un recibo ya devuelto») solo es cierto para
    // UNA de las dos cosas que significa ese estado: un reembolso. Un recibo
    // «devuelto por el banco» es deuda viva, `socio_tiene_impago` bloquea por
    // él, `dbMarcarCobrado` deja cerrarlo desde el panel y ahora también
    // /api/stripe/checkout deja pagarlo — si este escritor no lo aceptara, la
    // socia pagaría de verdad y el UPDATE tocaría 0 filas: sin entrega, sin
    // factura, sin email, sin renovación y todavía bloqueada. Cobrado y sin
    // entregar, que es peor que el problema que A-1 venía a arreglar.
    //
    // La lista sale de `ESTADOS_COBRABLES` para que no vuelva a haber cuatro
    // listas distintas, y las dos guardas de reembolso son las mismas columnas
    // que mira `esReciboCobrable`: un recibo que se le está devolviendo a la
    // socia NO se resucita por aquí.
    //
    // El tercer discriminante de `esReciboCobrable` (`importe_devuelto >=
    // importe`) NO se replica aquí, y es deliberado: PostgREST no compara dos
    // columnas entre sí, y hacerlo en TS sería un read-then-update con carrera.
    // La puerta que decide si se le puede COBRAR es /api/stripe/checkout, que
    // sí lo comprueba antes de mover un euro; si aun así llegara un pago sobre
    // una fila así, marcarla cobrada y ENTREGAR es menos malo que quedarse el
    // dinero sin entregar nada.
    .eq('id', reciboId).eq('studio_id', studioId)
    .in('estado', [...ESTADOS_COBRABLES, 'EN_CURSO'])
    .is('reembolso_stripe_id', null)
    .is('reembolso_solicitado_en', null)
    .select('id').maybeSingle();
  if (error) return { ok: false, error: error.message };

  if (!marcado) {
    // 0 filas tiene DOS causas muy distintas:
    //   · Stripe reentrega el MISMO evento — normal, no hay nada que hacer.
    //   · Un SEGUNDO cobro real del mismo recibo — dinero cobrado dos veces.
    // Se distinguen por el PaymentIntent: si el recibo ya guarda uno y llega
    // otro distinto, no es un reintento. Generalizado del webhook (F-13): el
    // conciliador antes no tenía esta protección en absoluto.
    if (paymentIntentId) {
      const { data: previo } = await admin.from('recibos')
        .select('stripe_payment_intent_id').eq('id', reciboId).eq('studio_id', studioId).maybeSingle();
      const anterior = (previo?.stripe_payment_intent_id as string | null) ?? null;
      if (anterior && anterior !== paymentIntentId) {
        Sentry.captureMessage('[confirmarCobroRecibo] SEGUNDO cobro del mismo recibo: hay que devolver uno', {
          level: 'error',
          extra: { reciboId, studioId, fuente, paymentIntentCobrado: anterior, paymentIntentDuplicado: paymentIntentId },
        });
      }
    }
    return { ok: true, actualizado: false };
  }

  // Renovación en servidor (refill de bono / extensión del mensual).
  // Best-effort e idempotente — nunca puede tumbar la confirmación del cobro.
  await aplicarRenovacionServidor(admin, { studioId, reciboId });

  // Sellado de factura: best-effort, NUNCA deshace el cobro si falla — el
  // dinero ya entró, no sellar es un problema de facturación, no de caja.
  const selladoFactura = await sellarFacturaDeRecibo(admin, {
    studioId, reciboId, facturaId: `fac-checkout-${reciboId}`,
  });
  if (!selladoFactura.ok) {
    await admin.from('recibos').update({ factura_pendiente_sellar: true })
      .eq('id', reciboId).eq('studio_id', studioId);
    Sentry.captureMessage('[confirmarCobroRecibo] cobro OK pero factura sin sellar', {
      level: 'warning', tags: { area: 'cobros', tipo: 'facturacion' },
      extra: { reciboId, studioId, fuente, error: selladoFactura.error },
    });
  }

  const { emitirPagoRealizado } = await import('../notifications/emit.ts');
  await emitirPagoRealizado(admin, { studioId, reciboId });
  const { enviarEmailReciboWebhook } = await import('../emails/enviar-recibo-webhook.ts');
  await enviarEmailReciboWebhook(admin, { studioId, reciboId });

  return { ok: true, actualizado: true };
}

/**
 * Reintenta el sellado de facturas de cobros ya confirmados pero cuyo sellado
 * falló (`factura_pendiente_sellar`), acotado a las últimas `horas` — nunca
 * retroactivo sin límite (ver cabecera del módulo). Lo llama el conciliador
 * horario; devuelve cuántas se sellaron.
 */
export async function reintentarFacturasPendientesDeSellar(
  admin: SupabaseClient,
  horas: number,
): Promise<number> {
  const desde = new Date(Date.now() - horas * 3600_000).toISOString();
  const { data: pendientes } = await admin
    .from('recibos')
    .select('id, studio_id')
    .eq('factura_pendiente_sellar', true)
    .eq('estado', 'COBRADO')
    .gte('fecha_cobro', desde.slice(0, 10))
    .limit(200);
  if (!pendientes?.length) return 0;

  let selladas = 0;
  for (const rec of pendientes as { id: string; studio_id: string }[]) {
    const res = await sellarFacturaDeRecibo(admin, {
      studioId: rec.studio_id, reciboId: rec.id, facturaId: `fac-checkout-${rec.id}`,
    });
    if (res.ok) {
      await admin.from('recibos').update({ factura_pendiente_sellar: false })
        .eq('id', rec.id).eq('studio_id', rec.studio_id);
      selladas++;
    } else {
      Sentry.captureMessage('[reintentarFacturasPendientesDeSellar] sigue sin poder sellar', {
        level: 'warning', tags: { area: 'cobros', tipo: 'facturacion' },
        extra: { reciboId: rec.id, studioId: rec.studio_id, error: res.error },
      });
    }
  }
  return selladas;
}

// Auditoría 23ª pasada (4-sep-2026), P-3. Tercer gemelo del mismo bloque:
// las dos ramas de app/api/stripe/webhook/route.ts (checkout.session.completed
// y el checkout embebido/Modo B) ya consumían el código de descuento al
// entregar el plan; lib/inngest/conciliar-cobros.ts —la red de recuperación,
// el camino REAL en 4 de cada 6 cobros según su propia cabecera— no lo
// mencionaba en ninguna línea. Un código de un solo uso quedaba reutilizable
// indefinidamente cada vez que era el conciliador quien rescataba el cobro.
//
// Best-effort a propósito, igual que sus dos hermanas: el pago ya está
// cobrado y el plan ya entregado, así que un fallo aquí no puede tumbar el
// evento — pero sí queda en Sentry, porque un código que no se descuenta de
// su límite es un uso gratis que nadie contó.
//
// `consumir_codigo_descuento` no es idempotente por sí sola (solo protege
// contra concurrencia del POS, no contra un reintento del MISMO evento). El
// INSERT en `codigos_descuento_consumos` es el compare-and-set real: gana el
// primer intento, un reintento choca por PK (23505) y se salta el consumo
// sin sumar un uso de más — mismo criterio que `entregarPlanComprado`.
export async function consumirCodigoDescuentoSiAplica(
  admin: SupabaseClient,
  params: { codigoDescuentoId: string | null | undefined; reciboId: string; studioId: string; socioId: string; fuente: string },
): Promise<void> {
  const { codigoDescuentoId, reciboId, studioId, socioId, fuente } = params;
  if (!codigoDescuentoId) return;
  const { error: errMarcarConsumo } = await admin
    .from('codigos_descuento_consumos')
    .insert({ recibo_id: reciboId, codigo_id: codigoDescuentoId, socio_id: socioId });
  if (!errMarcarConsumo) {
    const { data: usosTras, error: errConsumo } = await admin.rpc('consumir_codigo_descuento', { p_codigo_id: codigoDescuentoId });
    if (errConsumo) {
      Sentry.captureMessage(`[${fuente}] plan entregado pero el código de descuento no se consumió`, {
        level: 'warning', tags: { area: 'cobros' },
        extra: { codigoDescuentoId, studioId, reciboId, detalle: String(errConsumo) },
      });
    } else if (usosTras == null) {
      // ⚠️ 26ª pasada. `consumir_codigo_descuento` es un `UPDATE … RETURNING
      // usos` con el tope y el `activo` en su propio WHERE: si el código se
      // agotó o se desactivó ENTRE la validación y el cobro, no da error —
      // simplemente no toca ninguna fila y devuelve NULL. Aquí se descartaba
      // `data`, así que el descuento ya estaba aplicado al importe cobrado y
      // el contador de usos no lo registraba nunca: el tope se rebasaba en
      // silencio y no quedaba ni rastro para reconstruirlo después.
      //
      // No se revierte el cobro a propósito —el dinero ya se movió y quitarle
      // el descuento a posteriori sería peor—, pero el estudio tiene que poder
      // enterarse de que su campaña se pasó del tope.
      Sentry.captureMessage(`[${fuente}] descuento aplicado sobre un código agotado o desactivado`, {
        level: 'warning', tags: { area: 'cobros' },
        extra: { codigoDescuentoId, studioId, reciboId },
      });
    }
  } else if (errMarcarConsumo.code === '23505') {
    // P-5 (26ª pasada): el mismo 23505 tiene ahora DOS causas distintas, y no
    // son lo mismo. La PK (`recibo_id`) es el reintento de siempre —este
    // mismo evento ya se procesó, no pasa nada—. El UNIQUE nuevo
    // (`codigo_id, socio_id`) es que esta socia YA había canjeado este
    // código en OTRO recibo: el descuento se calculó y se cobró igual (se
    // aplica ANTES del cobro, en resolverDescuentoCheckout), así que el
    // dinero ya se movió de menos — no se puede deshacer aquí, pero el
    // estudio tiene que enterarse, mismo criterio que el código agotado de
    // más abajo. Se distingue por el nombre del índice en el mensaje de
    // Postgres, igual que ya se hace con roturas conocidas en otros sitios.
    if (/codigos_descuento_consumos_codigo_socio_unq/i.test(errMarcarConsumo.message ?? '')) {
      Sentry.captureMessage(`[${fuente}] descuento aplicado dos veces a la misma socia`, {
        level: 'warning', tags: { area: 'cobros' },
        extra: { codigoDescuentoId, studioId, reciboId, socioId },
      });
    }
    // Choque por `recibo_id` (reintento del mismo evento): no es un error, no
    // se reporta nada — mismo criterio de siempre.
  } else {
    Sentry.captureMessage(`[${fuente}] no se pudo registrar el consumo del código de descuento`, {
      level: 'warning', tags: { area: 'cobros' },
      extra: { codigoDescuentoId, studioId, reciboId, detalle: String(errMarcarConsumo) },
    });
  }
}

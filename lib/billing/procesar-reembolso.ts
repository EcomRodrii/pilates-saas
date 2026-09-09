// ─────────────────────────────────────────────────────────────────────────────
// Lógica de negocio de reembolsos/disputas, COMPARTIDA entre dos llamadores:
//
//   1. `app/api/stripe/webhook/route.ts` — camino principal, en tiempo real.
//   2. `lib/inngest/conciliar-reembolsos.ts` — red de seguridad, cada 2h, para
//      cuando el webhook responde 200 y muere en `after()` sin que Stripe
//      reintente.
//
// Antes de este módulo la lógica solo vivía en el webhook y el cron era un
// placebo: insertaba una fila de "ya lo vi" en `webhook_reembolsos`/
// `webhook_disputas` sin tocar el recibo, sin `registrarDevolucion` y sin
// notificar — auditoría 17ª pasada (26-ago-2026), hallazgo P-1.
//
// Estas funciones reciben datos YA EXTRAÍDOS de Stripe (nunca un
// `Stripe.Event`: el cron no tiene uno real) y el `studioId`/`reciboId` YA
// RESUELTOS por el llamador — cada llamador resuelve el tenant a su manera
// (el webhook por `event.account`, el cron porque ya itera por estudio), y
// mezclar esa resolución aquí dentro habría atado este módulo a la forma de
// uno de los dos caminos.
//
// Idempotentes de verdad, sin depender de ninguna tabla de "ya visto":
//   · el flip a DEVUELTO lleva `.neq('estado','DEVUELTO')`.
//   · `registrarDevolucion` tiene un UNIQUE por `referencia` (chargeId+acumulado
//     o disputeId) y devuelve `null` en un reintento — ver
//     `lib/billing/registrar-devolucion.ts`.
// Por eso el cron puede llamarlas sin miedo a duplicar, aunque el webhook YA
// se haya adelantado.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { registrarDevolucion, referenciaDevolucion, origenDeReembolso, type OrigenDevolucion } from './registrar-devolucion.ts';

// Orígenes cuyo PaymentIntent apunta a un recibo real de Tentare, y que por
// tanto hay que marcar DEVUELTO/disputado cuando se devuelve o se impugna.
//
// ⚠️ Es una LISTA, no dos comparaciones sueltas, porque ya se olvidó una: al
// añadir la metadata a las compras de plan por enlace público (`plan_web`) se
// escribió el `reciboId` en el PaymentIntent pero NO se añadió el origen aquí,
// así que los tres consumidores lo seguían descartando y la compra continuaba
// siendo invisible a reembolsos y disputas — exactamente el agujero que ese
// cambio decía cerrar. Al añadir un origen nuevo, añadirlo también aquí.
export const ORIGENES_CON_RECIBO = new Set(['sepa_recibo', 'tarjeta_recibo', 'plan_web', 'plan_web_embebido']);

// Cobros de datáfono/Bizum presencial (P-2, 17ª auditoría). Un origen aparte,
// no sumado a ORIGENES_CON_RECIBO: estas ventas NO tienen `recibos` —
// `ventas_pos` es su propia tabla, sin la máquina de entrega/bono/suscripción
// que sí necesita `registrarDevolucion`. Mismo motivo por el que el informe
// pedía "una rama propia, no dos strings más a la lista".
export const ORIGENES_POS = new Set(['pos_terminal', 'pos_bizum']);

export interface ChargeReembolsado {
  id: string;
  refunded: boolean;
  /** Céntimos. */
  amount: number | null;
  /** Céntimos, acumulado — lo que diga Stripe AHORA, no un delta. */
  amountRefunded: number | null;
}

export interface ResultadoProcesado {
  ok: boolean;
  /** true si esta llamada aplicó algo nuevo (no un reintento sobre un hecho ya anotado). */
  huboEfecto: boolean;
  error?: string;
}

/** Quién llama, solo para que los mensajes de log/Sentry digan de dónde viene. */
export type Fuente = 'webhook' | 'conciliador';

/** Un recibo, ya con SU propia porción del acumulado devuelto y SU propio total. */
async function procesarReembolsoDeUnRecibo(
  admin: SupabaseClient,
  p: {
    studioId: string;
    reciboId: string;
    origenPi: string | undefined;
    /**
     * Lo que dice Stripe (`charge.refunded`) sobre el CARGO ENTERO. Aplica
     * igual a los dos recibos de un cargo combinado: si Stripe dice que el
     * cargo entero está devuelto, las dos porciones lo están, aunque el
     * reparto en céntimos no cuadre exacto con el total de cada recibo.
     */
    refundedEnStripe: boolean;
    /** Céntimos, YA repartidos para ESTE recibo (no el acumulado del cargo entero). */
    devueltoCentimos: number;
    /** Céntimos, el total de ESTE recibo (no `charge.amount`). */
    totalCentimos: number;
    chargeId: string;
    fuente: Fuente;
    eventAccount?: string | null;
    /** Ver `referenciaDevolucion` — solo cuando el cargo reparte entre dos recibos. */
    sufijoReferencia?: string;
  },
): Promise<ResultadoProcesado> {
  const origen = origenDeReembolso({
    refunded: p.refundedEnStripe, acumulado: p.devueltoCentimos, total: p.totalCentimos,
  });

  // Solo un reembolso TOTAL anula el recibo: marcar DEVUELTO un parcial
  // infravaloraría los ingresos y dejaría un estado incoherente (recibo
  // "devuelto" con el bono ya aplicado). El parcial SÍ se anota más abajo
  // (registrarDevolucion), solo que sin tocar `recibos.estado`.
  if (origen === 'REEMBOLSO_TOTAL') {
    const { data: rec, error } = await admin.from('recibos')
      .update({
        estado: 'DEVUELTO', fecha_devolucion: new Date().toISOString(),
        sepa_estado: p.origenPi === 'sepa_recibo' ? 'returned' : null,
      })
      // `.neq('estado','DEVUELTO')` para que un reintento (webhook reenviado, o
      // el cron encontrando algo que el webhook ya aplicó) no reescriba la
      // fecha_devolucion original con la de hoy.
      .eq('id', p.reciboId).eq('studio_id', p.studioId).neq('estado', 'DEVUELTO')
      .select('id').maybeSingle();
    if (error) {
      console.error(`[${p.fuente}] no se pudo marcar el recibo DEVUELTO`, p.reciboId, error);
      return { ok: false, huboEfecto: false, error: error.message };
    }
    if (!rec) {
      // 0 filas no es un error: puede ser el reintento del mismo evento, o el
      // cron llegando después de que el webhook ya lo aplicara.
      Sentry.captureMessage(`[${p.fuente}] devolución sin efecto (recibo ya devuelto, inexistente o de otro estudio)`, {
        level: 'warning', extra: { reciboId: p.reciboId, studioId: p.studioId, eventAccount: p.eventAccount },
      });
    } else {
      // 44ª pasada de auditoría, H-2: si este recibo era el de una
      // penalización ya cobrada, avisa a la nómina de la instructora. Solo
      // en la transición REAL a DEVUELTO (`rec` truthy), nunca en un
      // reintento — igual que el resto de este bloque. Best-effort: el
      // dinero ya salió, un fallo aquí no puede tumbar la conciliación.
      try {
        const { marcarPenalizacionReembolsada } = await import('../equipo/liquidacion-penalizacion-revertida.ts');
        await marcarPenalizacionReembolsada(admin, p.studioId, p.reciboId);
      } catch (e) {
        console.error(`[${p.fuente}] no se pudo comprobar si el recibo era de una penalización`, p.reciboId, e instanceof Error ? e.message : e);
      }
    }
  }

  // Se anota SIEMPRE, total o parcial, y solo se avisa si es un hecho nuevo
  // (`null` = ya estaba registrada, por reintento del webhook o por el cron
  // llegando después).
  const dev = await registrarDevolucion(admin, {
    studioId: p.studioId, reciboId: p.reciboId, origen, devueltoCentimos: p.devueltoCentimos,
    referencia: referenciaDevolucion({
      tipo: 'reembolso', chargeId: p.chargeId, acumuladoDevueltoCentimos: p.devueltoCentimos,
      ...(p.sufijoReferencia ? { reciboId: p.sufijoReferencia } : {}),
    }),
    stripeChargeId: p.chargeId,
  });
  if (dev) {
    // Notificación best-effort: un fallo aquí no puede tumbar la conciliación
    // — el dinero y la fila de `devoluciones` ya están escritos pase lo que
    // pase con el aviso. `emitirDevolucion` ya se protege sola, pero el
    // propio `import()` puede fallar (módulo mal resuelto, red) ANTES de
    // llegar a su try/catch interno.
    try {
      const { emitirDevolucion } = await import('../notifications/emit.ts');
      const { data: recSocio } = await admin.from('recibos').select('socio_id').eq('id', p.reciboId).maybeSingle();
      await emitirDevolucion(admin, {
        studioId: p.studioId, socioId: (recSocio?.socio_id as string | null) ?? null,
        devolucionId: dev.id, importe: dev.importeDevuelto, origen,
      });
    } catch (e) {
      console.error(`[${p.fuente}] devolución anotada pero sin notificar`, p.reciboId, e instanceof Error ? e.message : e);
    }
  }
  return { ok: true, huboEfecto: !!dev };
}

export async function procesarChargeRefunded(
  admin: SupabaseClient,
  p: {
    studioId: string;
    reciboId: string;
    /**
     * 32ª pasada de auditoría: recibo de la matrícula, cuando el cargo la
     * combinó con el plan en un solo PaymentIntent (ver `entregarPlanComprado`).
     * Presente => el acumulado devuelto se reparte entre los dos recibos en
     * vez de atribuirse entero al del plan (`p.reciboId`), que es lo que
     * pasaba antes: la matrícula se quedaba COBRADO para siempre tras un
     * reembolso del cargo combinado.
     */
    reciboMatriculaId?: string | null;
    /** `pi.metadata?.origen` — decide si el reembolso parcial deja restaurado sepa_estado. */
    origenPi: string | undefined;
    charge: ChargeReembolsado;
    fuente: Fuente;
    eventAccount?: string | null;
  },
): Promise<ResultadoProcesado> {
  const acumuladoDevuelto = p.charge.amountRefunded ?? 0;

  if (!p.reciboMatriculaId) {
    // Camino de siempre: un único recibo, sin reparto — comportamiento
    // idéntico al de antes de esta pasada.
    return procesarReembolsoDeUnRecibo(admin, {
      studioId: p.studioId, reciboId: p.reciboId, origenPi: p.origenPi,
      refundedEnStripe: p.charge.refunded === true,
      devueltoCentimos: acumuladoDevuelto, totalCentimos: p.charge.amount ?? 0,
      chargeId: p.charge.id, fuente: p.fuente, eventAccount: p.eventAccount,
    });
  }

  // Cargo combinado plan+matrícula: se lee el importe REAL de cada recibo
  // (no `charge.amount`, que es la suma de los dos) para repartir el
  // acumulado devuelto al céntimo. Orden fijo: el plan primero, la matrícula
  // con el resto — mismo criterio que propuso la auditoría.
  const [{ data: recPlan }, { data: recMatricula }] = await Promise.all([
    admin.from('recibos').select('importe').eq('id', p.reciboId).eq('studio_id', p.studioId).maybeSingle(),
    admin.from('recibos').select('importe').eq('id', p.reciboMatriculaId).eq('studio_id', p.studioId).maybeSingle(),
  ]);
  if (!recPlan || !recMatricula) {
    // Uno de los dos recibos no existe (o es de otro estudio): no se puede
    // repartir con seguridad. Se cae al camino de siempre —todo al recibo
    // del plan— en vez de perder el reembolso entero por falta de reparto.
    Sentry.captureMessage(`[${p.fuente}] reembolso con matrícula pero no se encontraron los dos recibos: se atribuye todo al del plan`, {
      level: 'warning',
      extra: { reciboId: p.reciboId, reciboMatriculaId: p.reciboMatriculaId, studioId: p.studioId },
    });
    return procesarReembolsoDeUnRecibo(admin, {
      studioId: p.studioId, reciboId: p.reciboId, origenPi: p.origenPi,
      refundedEnStripe: p.charge.refunded === true,
      devueltoCentimos: acumuladoDevuelto, totalCentimos: p.charge.amount ?? 0,
      chargeId: p.charge.id, fuente: p.fuente, eventAccount: p.eventAccount,
    });
  }
  const planCentimos = Math.round(Number(recPlan.importe) * 100);
  const matriculaCentimos = Math.round(Number(recMatricula.importe) * 100);
  const devueltoPlan = Math.min(acumuladoDevuelto, planCentimos);
  const devueltoMatricula = Math.min(Math.max(0, acumuladoDevuelto - planCentimos), matriculaCentimos);

  const [resPlan, resMatricula] = await Promise.all([
    // Nada que anotar todavía si a este recibo no le tocó reparto (un parcial
    // pequeño que aún no llega a cubrir el plan entero) — una fila de
    // `devoluciones` con 0 devuelto sería ruido, no información.
    devueltoPlan > 0 ? procesarReembolsoDeUnRecibo(admin, {
      studioId: p.studioId, reciboId: p.reciboId, origenPi: p.origenPi,
      refundedEnStripe: p.charge.refunded === true,
      devueltoCentimos: devueltoPlan, totalCentimos: planCentimos,
      chargeId: p.charge.id, fuente: p.fuente, eventAccount: p.eventAccount,
      // Sufijo SIEMPRE en el camino de reparto: sin él, las dos llamadas
      // podrían compartir `referencia` si el importe repartido coincidiera
      // (p. ej. plan y matrícula del mismo precio), y la segunda chocaría
      // con el UNIQUE leyéndose como "ya registrada" sin haberlo estado nunca.
      sufijoReferencia: p.reciboId,
    }) : Promise.resolve<ResultadoProcesado>({ ok: true, huboEfecto: false }),
    devueltoMatricula > 0 ? procesarReembolsoDeUnRecibo(admin, {
      studioId: p.studioId, reciboId: p.reciboMatriculaId, origenPi: p.origenPi,
      refundedEnStripe: p.charge.refunded === true,
      devueltoCentimos: devueltoMatricula, totalCentimos: matriculaCentimos,
      chargeId: p.charge.id, fuente: p.fuente, eventAccount: p.eventAccount,
      sufijoReferencia: p.reciboMatriculaId,
    }) : Promise.resolve<ResultadoProcesado>({ ok: true, huboEfecto: false }),
  ]);

  return {
    ok: resPlan.ok && resMatricula.ok,
    huboEfecto: resPlan.huboEfecto || resMatricula.huboEfecto,
    error: resPlan.error ?? resMatricula.error,
  };
}

export async function procesarDisputeCreated(
  admin: SupabaseClient,
  p: { studioId: string; reciboId: string; disputeStatus: string; disputeId: string; dueByUnix: number | null; fuente: Fuente },
): Promise<ResultadoProcesado> {
  // `.select('id')`: sin él, un `reciboId` que no existe (o de otro estudio) no
  // da error y esta función devolvía `huboEfecto: true` y notificaba al estudio
  // una disputa que no quedó registrada en ninguna parte (auditoría 22ª pasada,
  // D-10).
  const { data: filas, error } = await admin.from('recibos')
    .update({ disputa_estado: p.disputeStatus, disputa_stripe_id: p.disputeId })
    .eq('id', p.reciboId).eq('studio_id', p.studioId).select('id');
  if (error || !filas?.length) {
    const motivo = error ?? new Error(`recibo ${p.reciboId} no encontrado en ${p.studioId}`);
    console.error(`[${p.fuente}] no se pudo registrar la disputa`, p.reciboId, motivo);
    return { ok: false, huboEfecto: false, error: error?.message ?? 'recibo no encontrado' };
  }
  try {
    const { emitirPagoDisputado } = await import('../notifications/emit.ts');
    await emitirPagoDisputado(admin, { studioId: p.studioId, reciboId: p.reciboId, plazoUnix: p.dueByUnix });
  } catch (e) {
    console.error(`[${p.fuente}] disputa registrada pero sin notificar`, p.reciboId, e instanceof Error ? e.message : e);
  }
  return { ok: true, huboEfecto: true };
}

/**
 * Cierre de la disputa: `lost` es un chargeback real (el dinero se revierte,
 * igual que un reembolso total) — `won`/`warning_closed` no tocan el recibo,
 * solo el estado, para que quede constancia de que se resolvió.
 */
export async function procesarDisputeClosed(
  admin: SupabaseClient,
  p: {
    studioId: string; reciboId: string; disputeStatus: string; disputeId: string;
    chargeId: string | null; amount: number | null; fuente: Fuente;
  },
): Promise<ResultadoProcesado> {
  // Se parte en DOS escrituras a propósito. `disputa_estado` debe sellarse
  // SIEMPRE (es el estado real de la disputa en Stripe y es idempotente);
  // `estado`/`fecha_devolucion` necesitan el guardia `.neq('DEVUELTO')` de su
  // gemelo (reembolso), para que una reentrega no reescriba la
  // fecha_devolucion original con la de hoy. Con una sola sentencia había que
  // elegir: o se perdía el guardia, o el guardia descartaba la fila entera y
  // `disputa_estado` no se guardaba nunca.
  // `.select('id')` igual que en `procesarDisputeCreated` (auditoría 22ª pasada,
  // D-10): un `reciboId` inexistente o de otro estudio no da error en Supabase,
  // y esta es la rama en la que el dinero SE VA de verdad (`lost` → DEVUELTO +
  // `registrarDevolucion` + aviso). Sin esto, se notificaba un chargeback que no
  // quedó escrito en ningún recibo. El gemelo de esta función ya lo llevaba: se
  // arregló uno y no el otro, que es el fallo dominante de este repo cometido
  // dentro del propio fix.
  const { data: filas, error: errUpdate } = await admin.from('recibos')
    .update({ disputa_estado: p.disputeStatus })
    .eq('id', p.reciboId).eq('studio_id', p.studioId).select('id');
  const error = errUpdate ?? (filas?.length ? null : new Error(`recibo ${p.reciboId} no encontrado en ${p.studioId}`));
  let errDevuelto = null;
  if (!error && p.disputeStatus === 'lost') {
    const r = await admin.from('recibos')
      .update({ estado: 'DEVUELTO', fecha_devolucion: new Date().toISOString() })
      .eq('id', p.reciboId).eq('studio_id', p.studioId).neq('estado', 'DEVUELTO');
    errDevuelto = r.error;
  }
  if (errDevuelto) {
    console.error(`[${p.fuente}] disputa perdida: no se pudo marcar DEVUELTO`, p.reciboId, errDevuelto);
    return { ok: false, huboEfecto: false, error: errDevuelto.message };
  }
  if (error) {
    console.error(`[${p.fuente}] no se pudo cerrar la disputa`, p.reciboId, error);
    return { ok: false, huboEfecto: false, error: error.message };
  }

  let huboEfecto = false;
  if (p.disputeStatus === 'lost') {
    // ⚠️ `charge_refunded` = el estudio reembolsó DURANTE la disputa. Ese
    // dinero ya lo anota `charge.refunded`/`procesarChargeRefunded` con la
    // misma referencia (`chargeId:acumulado`), así que `registrarDevolucion`
    // aquí no vuelve a encolar: si no, la propietaria vería dos tarjetas por
    // el mismo dinero y podría revertir dos veces.
    const dev = await registrarDevolucion(admin, {
      studioId: p.studioId, reciboId: p.reciboId, origen: 'CHARGEBACK',
      devueltoCentimos: p.amount ?? 0,
      referencia: referenciaDevolucion({ tipo: 'chargeback', disputeId: p.disputeId }),
      stripeChargeId: p.chargeId,
    });
    if (dev) {
      huboEfecto = true;
      try {
        const { emitirDevolucion } = await import('../notifications/emit.ts');
        const { data: recSocio } = await admin.from('recibos').select('socio_id').eq('id', p.reciboId).maybeSingle();
        await emitirDevolucion(admin, {
          studioId: p.studioId, socioId: (recSocio?.socio_id as string | null) ?? null,
          devolucionId: dev.id, importe: dev.importeDevuelto, origen: 'CHARGEBACK',
        });
      } catch (e) {
        console.error(`[${p.fuente}] chargeback anotado pero sin notificar`, p.reciboId, e instanceof Error ? e.message : e);
      }
    }
  }
  return { ok: true, huboEfecto };
}

/**
 * Reembolso de una venta de POS (datáfono `pos_terminal` / Bizum presencial
 * `pos_bizum`) — P-2, 17ª auditoría. La venta se localiza por
 * `stripe_payment_intent_id`.
 *
 * F-12/F-13 (rediseño de fondo): antes escribía directo en `ventas_pos` con un
 * guard `.or()` a mano, sin dejar ninguna fila en `devoluciones` — invisible
 * para cualquier vista/exportación que mire esa tabla, y sin distinguir
 * parcial de total como sí hace `registrarDevolucion`. Ahora pasa por el mismo
 * mecanismo único que un reembolso de recibo: la fila de `devoluciones` (con
 * `venta_pos_id`, `recibo_id` a NULL) es lo que dedupea por su UNIQUE de
 * `referencia` (chargeId+acumulado) — el guard `.or()` ya no hace falta.
 * `ventas_pos.devuelta_en/importe_devuelto` se siguen actualizando como espejo
 * de lectura rápida, mismo patrón que `recibos.importe_devuelto`.
 *
 * 19ª auditoría · F-3: la columna `stripe_payment_intent_id` existe desde
 * `0036_pagos_espana_sepa_bizum`, pero durante un tiempo ningún mapper la
 * escribía y esta consulta no casaba NUNCA (19 filas, 0 con PaymentIntent en
 * producción). El mapper ya la escribe hoy; sigue documentado aquí porque el
 * predicado silencioso es el mismo tipo de riesgo si algún día deja de
 * escribirse.
 */
export async function procesarReembolsoVentaPos(
  admin: SupabaseClient,
  p: {
    studioId: string;
    paymentIntentId: string;
    charge: ChargeReembolsado;
    fuente: Fuente;
  },
): Promise<ResultadoProcesado> {
  const acumuladoDevuelto = p.charge.amountRefunded ?? 0; // céntimos

  const { data: venta, error } = await admin.from('ventas_pos')
    .select('id, socio_id, total')
    .eq('studio_id', p.studioId).eq('stripe_payment_intent_id', p.paymentIntentId)
    .maybeSingle();
  if (error) {
    console.error(`[${p.fuente}] no se pudo localizar la venta POS`, p.paymentIntentId, error);
    return { ok: false, huboEfecto: false, error: error.message };
  }
  if (!venta) {
    // La venta nunca se registró en `ventas_pos` (el POS está congelado —
    // lib/frozen-features.ts — así que un cobro de datáfono sin su venta
    // asociada no puede completarse desde el panel). Única señal de que hay
    // dinero devuelto en Stripe sin ninguna fila que lo refleje.
    Sentry.captureMessage(`[${p.fuente}] reembolso de venta POS sin venta asociada`, {
      level: 'warning', extra: { paymentIntentId: p.paymentIntentId, studioId: p.studioId },
    });
    return { ok: true, huboEfecto: false };
  }

  const origen: OrigenDevolucion = origenDeReembolso({
    refunded: p.charge.refunded === true, acumulado: acumuladoDevuelto, total: p.charge.amount ?? 0,
  });

  const dev = await registrarDevolucion(admin, {
    studioId: p.studioId, ventaPosId: venta.id as string, origen, devueltoCentimos: acumuladoDevuelto,
    referencia: referenciaDevolucion({ tipo: 'reembolso', chargeId: p.charge.id, acumuladoDevueltoCentimos: acumuladoDevuelto }),
    stripeChargeId: p.charge.id,
  });
  if (!dev) {
    // Reintento del mismo evento (el UNIQUE de `devoluciones.referencia` ya
    // frenó el INSERT) — no hay nada nuevo que anotar ni que avisar.
    return { ok: true, huboEfecto: false };
  }

  try {
    const { emitirVentaPosDevuelta } = await import('../notifications/emit.ts');
    await emitirVentaPosDevuelta(admin, {
      studioId: p.studioId, socioId: (venta.socio_id as string | null) ?? null,
      ventaPosId: venta.id as string, importe: dev.importeDevuelto,
    });
  } catch (e) {
    console.error(`[${p.fuente}] venta POS marcada devuelta pero sin notificar`, venta.id, e instanceof Error ? e.message : e);
  }
  return { ok: true, huboEfecto: true };
}

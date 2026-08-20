// ─────────────────────────────────────────────────────────────────────────────
// Devoluciones: dejar constancia de que ha entrado una, y de si tiene sentido
// ofrecer deshacer lo entregado.
//
// Aquí NO se revierte nada. La reversión la decide una persona, con los números
// delante (ver el plan): revertir en automático le quitaría a la socia sesiones
// que sí pagó en el caso más frecuente de reembolso, que es el doble cargo.
//
// Sin Stripe dentro a propósito: el webhook le pasa datos ya extraídos, y así
// todo lo que decide algo es probable sin red.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';

export type OrigenDevolucion = 'REEMBOLSO_TOTAL' | 'REEMBOLSO_PARCIAL' | 'CHARGEBACK';

export type EstadoDevolucion =
  | 'PENDIENTE_REVISION'
  | 'OMITIDA_SIN_ENTREGA'
  | 'OMITIDA_SIN_INSTRUMENTAR';

/**
 * Clave natural del hecho en Stripe. Es lo que impide duplicar tarjetas.
 *
 * ⚠️ Hace falta de verdad: `reclamarWebhookEvent` expira a los 120 s y falla
 * ABIERTO, así que el handler se re-ejecuta. Hoy da igual solo porque el UPDATE
 * del recibo es idempotente; un INSERT no lo es.
 *
 * - Reembolso → `${chargeId}:${acumuladoDevueltoCentimos}`. El acumulado hace
 *   que un reintento del MISMO reembolso colapse, pero que un SEGUNDO parcial
 *   (acumulado distinto) sí cree fila nueva, que es lo correcto.
 * - Chargeback perdido → `dispute:${disputeId}`.
 *
 * El caso que esto resuelve y que es fácil no ver: si el estudio reembolsa
 * DURANTE una disputa, Stripe manda `charge.refunded` **y**
 * `charge.dispute.closed` con status `charge_refunded` por el mismo dinero. Los
 * dos comparten `chargeId` y acumulado, así que caen en la misma referencia y
 * la propietaria ve UNA tarjeta, no dos.
 */
export function referenciaDevolucion(p:
  | { tipo: 'reembolso'; chargeId: string; acumuladoDevueltoCentimos: number }
  | { tipo: 'chargeback'; disputeId: string },
): string {
  return p.tipo === 'reembolso'
    ? `${p.chargeId}:${p.acumuladoDevueltoCentimos}`
    : `dispute:${p.disputeId}`;
}

/** Un reembolso es total cuando Stripe lo dice, o cuando el acumulado alcanza el cargo. */
export function origenDeReembolso(p: { refunded: boolean; acumulado: number; total: number }): OrigenDevolucion {
  return p.refunded || p.acumulado >= p.total ? 'REEMBOLSO_TOTAL' : 'REEMBOLSO_PARCIAL';
}

/**
 * ¿Tiene sentido ofrecer deshacer la entrega de este cobro?
 *
 * Solo mira lo que se puede saber del propio recibo. Que la suscripción se haya
 * movido DESDE la entrega no se decide aquí —puede cambiar entre la detección y
 * el momento de revisarla—, sino al calcular la vista previa.
 *
 * Las tres respuestas son distintas y ninguna se infiere de las otras:
 *  · `null`  → el cobro es anterior a que se guardara el snapshot. No se sabe.
 *  · `false` → se evaluó y no cambió nada (bono con saldo, mensual ya extendido).
 *  · sin suscripción → no entregó ningún servicio (p. ej. una penalización).
 */
export function estadoInicialDevolucion(recibo: {
  entrega_aplicada: boolean | null;
  suscripcion_id: string | null;
}): EstadoDevolucion {
  if (recibo.entrega_aplicada === null || recibo.entrega_aplicada === undefined) {
    return 'OMITIDA_SIN_INSTRUMENTAR';
  }
  if (recibo.entrega_aplicada === false || !recibo.suscripcion_id) return 'OMITIDA_SIN_ENTREGA';
  return 'PENDIENTE_REVISION';
}

// ── D-8: el reembolso que FALLA días después de crearse ─────────────────────
//
// Un refund puede fallar mucho después de `charge.refunded` (SEPA sobre todo):
// Stripe devuelve el dinero al estudio y DECREMENTA `amount_refunded` — pero
// Tentare ya marcó el recibo DEVUELTO, anotó la devolución y quizá la
// propietaria ya pulsó REVERTIDA (le quitó lo entregado a la socia): pagó Y
// perdió sesiones. Aquí se DECIDE qué corregir; el webhook ejecuta.
//
// Decisiones con el charge FRESCO, nunca con el evento: tras el fallo, el
// acumulado real ya está decrementado, y es lo único que dice la verdad si
// hubo varios reembolsos parciales.

export interface PlanFalloDevolucion {
  /**
   * DEVUELTO → COBRADO. Solo si tras el fallo el cargo ya NO está totalmente
   * devuelto, y nunca sobre un chargeback perdido (ese DEVUELTO lo puso la
   * disputa, no este refund).
   */
  flipar: boolean;
  /** Un `sepa_recibo` que se flipa debe restaurar el estado del adeudo bueno. */
  sepaEstadoRestaurado: 'succeeded' | null;
  /**
   * La referencia con la que se creó la fila de `devoluciones` al anotarse el
   * reembolso: en aquel momento el acumulado era el fresco de hoy MÁS lo que
   * este refund intentaba devolver (Stripe lo restó al fallar).
   */
  referenciaOriginal: string;
  /** Acumulado real tras el fallo, en euros — valor ABSOLUTO, idempotente. */
  importeDevueltoFresco: number;
}

export function resolverFalloDevolucion(p: {
  estadoRecibo: string;
  disputaEstado: string | null;
  esSepa: boolean;
  chargeId: string;
  /** Charge FRESCO tras el fallo. */
  refunded: boolean;
  acumuladoCentimos: number;
  totalCentimos: number;
  /** Lo que el refund fallido intentaba devolver. */
  refundCentimos: number;
}): PlanFalloDevolucion {
  const sigueTotalmenteDevuelto =
    p.refunded || (p.totalCentimos > 0 && p.acumuladoCentimos >= p.totalCentimos);
  const flipar =
    p.estadoRecibo === 'DEVUELTO' && p.disputaEstado !== 'lost' && !sigueTotalmenteDevuelto;
  return {
    flipar,
    sepaEstadoRestaurado: flipar && p.esSepa ? 'succeeded' : null,
    referenciaOriginal: referenciaDevolucion({
      tipo: 'reembolso',
      chargeId: p.chargeId,
      acumuladoDevueltoCentimos: p.acumuladoCentimos + p.refundCentimos,
    }),
    importeDevueltoFresco: p.acumuladoCentimos / 100,
  };
}

export interface DevolucionRegistrada {
  id: string;
  estado: EstadoDevolucion;
  origen: OrigenDevolucion;
  importeDevuelto: number;
}

/**
 * Anota la devolución y pone al día el acumulado del recibo. Devuelve `null` si
 * ya estaba registrada (reintento de Stripe), para que el llamante NO vuelva a
 * notificar.
 *
 * Nunca lanza: una devolución que no se puede anotar no debe tumbar el webhook
 * —el dinero ya se ha movido en Stripe pase lo que pase aquí—, pero sí devuelve
 * `null` para que quede claro que no hay nada nuevo que contar.
 */
export async function registrarDevolucion(admin: SupabaseClient, p: {
  studioId: string;
  reciboId: string;
  origen: OrigenDevolucion;
  /** Acumulado devuelto en CÉNTIMOS, tal cual lo da Stripe. */
  devueltoCentimos: number;
  referencia: string;
  stripeChargeId?: string | null;
}): Promise<DevolucionRegistrada | null> {
  const { data: rec } = await admin
    .from('recibos')
    .select('id, socio_id, suscripcion_id, importe, entrega_aplicada')
    .eq('id', p.reciboId)
    .eq('studio_id', p.studioId)
    .maybeSingle();
  if (!rec) return null;

  const importeDevuelto = p.devueltoCentimos / 100;
  const estado = estadoInicialDevolucion(rec as { entrega_aplicada: boolean | null; suscripcion_id: string | null });

  const { data, error } = await admin.from('devoluciones').insert({
    id: `dev-${crypto.randomUUID()}`,
    studio_id: p.studioId,
    recibo_id: p.reciboId,
    socio_id: rec.socio_id ?? null,
    suscripcion_id: rec.suscripcion_id ?? null,
    origen: p.origen,
    importe_cobrado: rec.importe,
    importe_devuelto: importeDevuelto,
    stripe_charge_id: p.stripeChargeId ?? null,
    referencia: p.referencia,
    estado,
  }).select('id').maybeSingle();

  // 23505 = ya estaba registrada (reintento). No es un fallo, pero tampoco hay
  // nada nuevo: se devuelve null para que no se vuelva a avisar.
  if (error) {
    if ((error as { code?: string }).code !== '23505') {
      console.error('[devoluciones] no se pudo registrar', p.referencia, error.message);
    }
    return null;
  }
  if (!data) return null;

  // El acumulado del recibo se escribe con el valor ABSOLUTO que da Stripe, no
  // incrementando: así un reintento lo deja igual en vez de sumar dos veces.
  const { error: errImporte } = await admin.from('recibos')
    .update({ importe_devuelto: importeDevuelto })
    .eq('id', p.reciboId).eq('studio_id', p.studioId);
  if (errImporte) {
    console.error('[devoluciones] devolución anotada pero sin actualizar el acumulado del recibo', p.reciboId, errImporte.message);
  }

  return { id: data.id as string, estado, origen: p.origen, importeDevuelto };
}

// ─────────────────────────────────────────────────────────────────────────────
// Las dos maneras de que un cobro deje de estar, y qué botón toca a cada recibo.
//
//   · «Le he devuelto el dinero»: el ESTUDIO le devuelve el dinero a la clienta
//     (en efectivo, por Bizum, por transferencia…). Ya no debe nada: es un
//     reembolso, DEVUELTO con `importe_devuelto = importe`
//     (lib/billing/reembolso-manual.ts).
//   · «El banco lo devolvió»: un BANCO devuelve el cargo (contracargo del
//     datáfono, adeudo rechazado). Vuelve a deber: DEVUELTO con
//     `importe_devuelto = 0` (lib/billing/marcar-devuelto.ts).
//
// Son hechos opuestos (lib/billing/situacion-recibo.ts) y antes compartían un
// solo botón, «Devolver», que siempre escribía el segundo: devolver en mano un
// cobro en efectivo lo convertía en deuda, bloqueaba las reservas de la clienta
// por impago y volvía a ofrecer «Cobrar». Decisión del fundador (2-oct-2026):
// dos botones, y que el servidor no deje usar el que no toca.
//
// La pantalla y las dos rutas deciden con estas mismas funciones. Puro, sin
// `@/`: lo prueba `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { situacionRecibo, type ReciboParaCifras } from './situacion-recibo.ts';

/**
 * ¿Entró este cobro por Stripe? No basta con `stripe_payment_intent_id`: un adeudo
 * SEPA que sale en `processing` lo deja escrito en el recibo, falla, y si la socia
 * paga luego en efectivo el id sigue ahí sin que el dinero pasara por Stripe (y el
 * reembolso no tendría cargo que devolver).
 */
export function cobroEntroPorStripe(r: { stripe_payment_intent_id?: unknown; metodo_cobro?: unknown; sepa_estado?: unknown }): boolean {
  if (!r.stripe_payment_intent_id) return false;
  if (r.metodo_cobro === 'EFECTIVO' || r.metodo_cobro === 'TRANSFERENCIA') return false;
  return r.sepa_estado !== 'failed';
}

/**
 * ¿Puede un banco devolver un cobro hecho así? Solo lo que pasó por un banco:
 * la tarjeta (un contracargo del datáfono) y el adeudo SEPA. Sin método no se
 * sabe, y se deja. El efectivo, el Bizum y la transferencia no los devuelve
 * ningún banco: si ese dinero salió, lo devolvió el estudio.
 */
export function elBancoPuedeDevolver(metodo: string | null | undefined): boolean {
  return metodo == null || metodo === 'TARJETA' || metodo === 'SEPA';
}

/** Lo que hace falta de un recibo del panel (camelCase) para decidir sus botones. */
export type ReciboParaDevolver = ReciboParaCifras & {
  metodoCobro?: string | null;
  sepaEstado?: string | null;
  stripePaymentIntentId?: string | null;
};

export interface AccionesDeDevolucion {
  /** «Le he devuelto el dinero»: un cobro hecho a mano, sin nada devuelto aún. */
  reembolsoAMano: boolean;
  /** «El banco lo devolvió» (vuelve a deber). */
  bancoLoDevolvio: boolean;
  /** «El banco lo ha cobrado»: enviado en una remesa y sin ningún cobro de Stripe en vuelo. */
  bancoLoCobro: boolean;
  /** Enviado al banco, pero con un cargo de Stripe en vuelo: lo cierra Stripe, no el mostrador. */
  loCierraStripe: boolean;
}

/**
 * Qué botones de devolución tiene este recibo. Un cobro que entró por Stripe no
 * tiene ninguno de los dos: su devolución sale por Stripe («Devolver» de la
 * ficha), y el webhook lo marca solo.
 */
export function accionesDeDevolucion(r: ReciboParaDevolver): AccionesDeDevolucion {
  const nada = { reembolsoAMano: false, bancoLoDevolvio: false, bancoLoCobro: false, loCierraStripe: false };
  const porStripe = cobroEntroPorStripe({
    stripe_payment_intent_id: r.stripePaymentIntentId, metodo_cobro: r.metodoCobro, sepa_estado: r.sepaEstado,
  });
  if (r.estado === 'EN_CURSO') {
    return r.stripePaymentIntentId
      ? { ...nada, loCierraStripe: true }
      : { ...nada, bancoLoCobro: true, bancoLoDevolvio: true };
  }
  if (r.estado === 'PENDIENTE' || r.estado === 'FALLIDO') return { ...nada, bancoLoDevolvio: true };
  if (r.estado !== 'COBRADO' || porStripe) return nada;
  // Un cobro con algo ya devuelto, o con un reembolso pedido, no se toca desde aquí.
  const yaDevuelto = Number(r.importeDevuelto ?? 0) > 0 || !!r.reembolsoSolicitadoEn || !!r.reembolsoStripeId;
  if (yaDevuelto || situacionRecibo(r) !== 'COBRADO') return nada;
  return { ...nada, reembolsoAMano: true, bancoLoDevolvio: elBancoPuedeDevolver(r.metodoCobro) };
}

/**
 * Lo que dice el servidor cuando se pide «El banco lo devolvió» sobre un cobro
 * que ningún banco puede devolver.
 */
export const TEXTO_NO_LO_DEVUELVE_EL_BANCO =
  'Un cobro en efectivo, por Bizum o por transferencia no lo devuelve el banco: si le has devuelto el dinero, usa «Le he devuelto el dinero».';

// Una renovación que NO se va a cobrar sola: recibo de renovación PENDIENTE sin
// reintento programado. Pasa cuando la clienta no tiene tarjeta ni SEPA
// guardados (`lib/inngest/renovaciones.ts` deja `proximo_reintento` en null: no
// hay a quién cobrarle off-session). Es lo normal si la cuota se cobró en
// recepción —datáfono, efectivo, Bizum—: ninguno de esos guarda la tarjeta.
//
// Hasta ahora ese recibo se quedaba pendiente sin avisar a nadie. Esta es la
// ÚNICA definición del caso: la usan el aviso a la alumna, su botón de pagar en
// la app y la línea de la bandeja del estudio, y tienen que contar lo mismo.
//
// Puro y sin `@/`: lo prueba el runner de Node.

export interface FilaReciboRenovacion {
  id: string;
  estado: string;
  es_renovacion: boolean | null;
  proximo_reintento: string | null;
  concepto: string | null;
  importe: number | null;
  fecha_vencimiento: string | null;
}

/**
 * ⚠️ Con reintento programado NO entra: ese lo cobra solo el dunning, y ofrecer
 * pagarlo a mano a la vez podría cobrarlo dos veces.
 */
export function esRenovacionSinCobroAutomatico(r: Pick<FilaReciboRenovacion, 'estado' | 'es_renovacion' | 'proximo_reintento'>): boolean {
  return r.estado === 'PENDIENTE' && r.es_renovacion === true && !r.proximo_reintento;
}

export interface RenovacionPorPagar {
  reciboId: string;
  concepto: string;
  importe: number;
  /** YYYY-MM-DD, o null si el recibo no lo trae. */
  vence: string | null;
  /** El estudio cobra online (tiene Stripe conectado): se le ofrece pagarla desde la app. */
  pagableOnline: boolean;
}

/** La renovación que esta clienta tiene por pagar a mano, la más antigua primero. `null` si no hay. */
export function renovacionPorPagar(recibos: FilaReciboRenovacion[], pagableOnline: boolean): RenovacionPorPagar | null {
  const r = recibos
    .filter(esRenovacionSinCobroAutomatico)
    .sort((a, b) => (a.fecha_vencimiento ?? '').localeCompare(b.fecha_vencimiento ?? ''))[0];
  if (!r) return null;
  return {
    reciboId: r.id, concepto: r.concepto ?? 'tu cuota', importe: r.importe ?? 0,
    vence: r.fecha_vencimiento ? r.fecha_vencimiento.slice(0, 10) : null, pagableOnline,
  };
}

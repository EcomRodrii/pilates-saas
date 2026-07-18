// Fase 1 · PR-3 — Decisión pura de con qué método cobrar un recibo off-session.
//
// Regla: se respeta la preferencia de la socia (SEPA domiciliado) si tiene el
// mandato listo; si no, se cae a la tarjeta guardada; si no hay ninguno, no se
// puede cobrar. Aislado como función pura para testear la lógica sin Stripe.

export interface SocioMetodoPago {
  metodo_pago_preferido?: string | null;
  stripe_payment_method_id?: string | null; // tarjeta guardada
  sepa_payment_method_id?: string | null;    // PaymentMethod sepa_debit del mandato
  sepa_mandate_id?: string | null;           // mandato SEPA aceptado
}

export type MetodoCobroElegido =
  | { ok: true; metodo: 'SEPA'; paymentMethodId: string; mandateId: string | null }
  | { ok: true; metodo: 'TARJETA'; paymentMethodId: string }
  | { ok: false; motivo: 'SIN_METODO' };

export function elegirMetodoCobro(socio: SocioMetodoPago): MetodoCobroElegido {
  const sepaListo = !!socio.sepa_payment_method_id;
  const tarjetaLista = !!socio.stripe_payment_method_id;
  const prefiereSepa = socio.metodo_pago_preferido === 'SEPA';

  // Preferencia SEPA cuando está lista.
  if (prefiereSepa && sepaListo) {
    return { ok: true, metodo: 'SEPA', paymentMethodId: socio.sepa_payment_method_id!, mandateId: socio.sepa_mandate_id ?? null };
  }
  // Si no prefiere SEPA (o no lo tiene listo) pero tiene tarjeta, usa tarjeta.
  if (tarjetaLista) {
    return { ok: true, metodo: 'TARJETA', paymentMethodId: socio.stripe_payment_method_id! };
  }
  // Último recurso: tiene SEPA aunque no lo haya marcado como preferido.
  if (sepaListo) {
    return { ok: true, metodo: 'SEPA', paymentMethodId: socio.sepa_payment_method_id!, mandateId: socio.sepa_mandate_id ?? null };
  }
  return { ok: false, motivo: 'SIN_METODO' };
}

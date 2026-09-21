// Ids deterministas de lo que crea la entrega de un plan comprado online, a
// partir del id del cobro de Stripe (cs_/pi_): un reintento del webhook deriva
// los MISMOS ids y choca por PK en vez de duplicar. Comentario completo del
// porqué en lib/billing/entregar-plan-comprado.ts.
export function idsDe(sessionId: string) {
  // Sufijo corto y estable: los ids de sesión/PaymentIntent de Stripe son largos.
  const base = sessionId.replace(/^(cs|pi)_(test_|live_)?/, '').slice(0, 24);
  return {
    suscripcionId: `sus-web-${base}`,
    reciboId: `rec-web-${base}`,
    // P-1 (auditoría 26ª pasada): recibo APARTE para la matrícula, con el
    // mismo sufijo derivado — un reintento del webhook choca por PK igual
    // que el recibo del plan, nunca duplica la matrícula.
    reciboMatriculaId: `rec-web-mat-${base}`,
    socioId: `soc-web-${base}`,
    // "Pagar y reservar sin login previo" (docs/reserva-sin-login-diseno.md
    // §4.2): idempotencia de la RESERVA nacida de este pago, mismo patrón —
    // un reintento del webhook deriva el MISMO id, así que reservar_plaza
    // choca por PK en vez de duplicar la plaza.
    reservaId: `res-web-${base}`,
  };
}

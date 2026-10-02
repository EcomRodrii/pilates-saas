// ─────────────────────────────────────────────────────────────────────────────
// Cobrar a mano un recibo que tiene un ENLACE DE PAGO abierto (2-oct-2026).
//
// Si la clienta abre el enlace de pago de su recibo (Checkout de Stripe) y en el
// mostrador se le cobra ese mismo recibo en efectivo, y luego termina el pago
// online, entran DOS cobros reales. Hasta hoy solo lo frenaba la pantalla, con lo
// que sabía al pintarse; el servidor lo detectaba después (`otro_cobro`, Sentry).
//
// `recibos.checkout_session_id` NO se borra cuando la sesión caduca o se
// abandona, así que «tiene sesión» no significa «se puede pagar»: bloquear por la
// columna dejaría el recibo sin poder cobrarse a mano nunca. Se pregunta a Stripe:
//   · abierta  → se CIERRA (expire) y se sigue: ya nadie puede pagarla;
//   · pagada   → no se cobra: el dinero ya entró (lo cierra el webhook/conciliador);
//   · caducada, o no existe en esa cuenta → se sigue;
//   · no se puede saber (Stripe caído) → no se cobra: mejor reintentar que cobrar dos veces.
//
// Puro salvo por el cliente que se le pasa: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export type PagoOnlineAlCobrarAMano =
  | { tipo: 'SEGUIR' }
  | { tipo: 'YA_PAGADO' }
  | { tipo: 'NO_SE_SABE' };

/** Lo que hace falta de `stripe.checkout.sessions`, en la cuenta del estudio. */
export interface SesionesDeStripe {
  consultar(id: string): Promise<{ status: string | null }>;
  cerrar(id: string): Promise<{ status: string | null }>;
}

export const MENSAJE_YA_PAGADO_ONLINE =
  'Lo acaba de pagar online: no se ha cobrado aquí. Se marcará cobrado solo en cuanto Stripe lo confirme.';
export const MENSAJE_PAGO_ONLINE_SIN_COMPROBAR =
  'Tiene un enlace de pago abierto y no hemos podido cerrarlo: no se ha cobrado. Inténtalo en un momento.';
export const MENSAJE_COBRO_EN_EL_DATAFONO =
  'Se está cobrando en el datáfono: no se ha cobrado aquí. Espera a que termine, o cancélalo en la caja.';

/** La sesión no existe en esa cuenta (borrada, o de otra cuenta): nadie puede pagarla. */
function noExiste(e: unknown): boolean {
  const err = e as { code?: string; statusCode?: number } | null;
  return err?.code === 'resource_missing' || err?.statusCode === 404;
}

export async function cerrarPagoOnlineAntesDeCobrarAMano(
  sesionId: string | null | undefined,
  stripe: SesionesDeStripe | null,
): Promise<PagoOnlineAlCobrarAMano> {
  if (!sesionId) return { tipo: 'SEGUIR' };
  // Sin Stripe en el estudio (desconectado después de abrir el enlace) no hay cuenta
  // a la que preguntar, ni webhook que cerrara ese pago: bloquear aquí dejaría el
  // recibo sin poder cobrarse nunca. Se sigue, y quien llama lo deja anotado.
  if (!stripe) return { tipo: 'SEGUIR' };
  let estado: string | null;
  try {
    estado = (await stripe.consultar(sesionId)).status;
  } catch (e) {
    return noExiste(e) ? { tipo: 'SEGUIR' } : { tipo: 'NO_SE_SABE' };
  }
  if (estado === 'complete') return { tipo: 'YA_PAGADO' };
  if (estado === 'expired') return { tipo: 'SEGUIR' };
  if (estado !== 'open') return { tipo: 'NO_SE_SABE' };
  try {
    const cerrada = await stripe.cerrar(sesionId);
    if (cerrada.status === 'expired') return { tipo: 'SEGUIR' };
  } catch {
    // Lo normal es que la haya pagado entre la consulta y aquí: se vuelve a mirar.
  }
  try {
    const otraVez = (await stripe.consultar(sesionId)).status;
    if (otraVez === 'complete') return { tipo: 'YA_PAGADO' };
    if (otraVez === 'expired') return { tipo: 'SEGUIR' };
  } catch (e) {
    if (noExiste(e)) return { tipo: 'SEGUIR' };
  }
  return { tipo: 'NO_SE_SABE' };
}

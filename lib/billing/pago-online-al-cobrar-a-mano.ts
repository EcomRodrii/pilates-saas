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

// ─── El cobro del DATÁFONO (o Bizum del mostrador) que quedó en el recibo ────
// `cobro_mostrador_pi` solo se suelta cuando el mostrador ve el final del cobro.
// Si se arranca y nadie lo termina ni lo cancela (la clienta se va, se cierra la
// pestaña), se queda puesto para siempre y el recibo no se podría cobrar a mano.
// Mismo trato que el enlace de pago: se pregunta; si sigue esperando, se cancela;
// si ya no puede cobrarse, se suelta; si está en curso o pagado, no se cobra.

export type EstadoCobroMostrador = 'PAGADO' | 'PROCESANDO' | 'PENDIENTE' | 'CANCELADO' | 'EXPIRADO' | 'RECHAZADO' | 'ERROR';

export interface CobroDeMostrador {
  consultar(): Promise<EstadoCobroMostrador>;
  cancelar(): Promise<void>;
  /** Suelta la referencia del recibo (compare-and-set sobre la misma). `false` = no se pudo. */
  soltar(): Promise<boolean>;
}

export type CobroDeMostradorAlCobrarAMano = { tipo: 'SEGUIR' } | { tipo: 'YA_PAGADO' } | { tipo: 'EN_MARCHA' };

const YA_NO_COBRA: ReadonlySet<EstadoCobroMostrador> = new Set(['CANCELADO', 'EXPIRADO', 'RECHAZADO']);

export async function soltarCobroDeMostradorAntesDeCobrarAMano(
  referencia: string | null | undefined,
  cobro: CobroDeMostrador | null,
): Promise<CobroDeMostradorAlCobrarAMano> {
  if (!referencia) return { tipo: 'SEGUIR' };
  // Sin Stripe no hay datáfono ni Bizum que pudieran cobrar: la referencia es vieja.
  if (!cobro) return { tipo: 'SEGUIR' };
  let estado = await cobro.consultar();
  if (estado === 'PENDIENTE') {
    await cobro.cancelar();
    estado = await cobro.consultar();
  }
  if (estado === 'PAGADO') return { tipo: 'YA_PAGADO' };
  if (YA_NO_COBRA.has(estado)) return (await cobro.soltar()) ? { tipo: 'SEGUIR' } : { tipo: 'EN_MARCHA' };
  // PROCESANDO, ERROR (no se pudo preguntar) o PENDIENTE que no se dejó cancelar.
  return { tipo: 'EN_MARCHA' };
}

export const MENSAJE_YA_PAGADO_EN_EL_DATAFONO =
  'Ya se cobró en el datáfono: no se ha cobrado aquí. Ábrelo en la caja para cerrarlo.';
export const MENSAJE_SE_ABRIO_UN_PAGO =
  'Mientras tanto se ha abierto un pago online o en el datáfono para este recibo: no se ha cobrado aquí. Vuelve a intentarlo.';

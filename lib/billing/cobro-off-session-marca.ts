// ─────────────────────────────────────────────────────────────────────────────
// La marca de «cobro con tarjeta o domiciliación guardada EN MARCHA».
//
// `cobrarReciboOffSession` crea y confirma el cargo en la MISMA llamada a Stripe
// (`confirm: true`), así que no hay un «después» donde guardar nada a tiempo: si
// entre leer el recibo y cobrarlo alguien lo daba por cobrado por otra puerta
// («Marcar cobrado», «El banco lo ha cobrado»), entraban
// dos cobros reales y solo se veía después (`otro_cobro` en `confirmarCobro`).
//
// Ahora, justo antes del `create`, el recibo se RESERVA con compare-and-set
// (`recibos.cobro_off_session_clave` + `_desde`, migr «recibos_cobro_off_session_en_marcha»).
// Con la marca puesta:
//   · las puertas que cobran a mano la exigen a null (`ESPERA_A_UN_COBRO_OFF_SESSION`
//     en cobro-confirmado-reglas.ts) y no cobran;
//   · la remesa, el datáfono y un enlace nuevo tampoco (`COLUMNAS_COBRO_EN_MARCHA`).
// Las confirmaciones de Stripe (webhook, conciliador, TPV) NO se bloquean: ese
// dinero ya entró. La quita quien resuelve el cargo, en el mismo UPDATE:
//   · `succeeded` → `confirmarCobro` (COBRADO);
//   · SEPA `processing` → `marcarAdeudoEnCurso` (EN_CURSO con su cargo);
//   · rechazo o 3DS → `soltarMarcaCobroOffSession`;
//   · desenlace DESCONOCIDO (red, 5xx) → se queda: el cargo pudo entrar.
// Una marca que se queda colgada (el proceso muere, o el desenlace fue
// desconocido) la resuelve el conciliador horario PREGUNTANDO A STRIPE
// (`decidirMarcaHuerfana`). Nunca caduca a ciegas: soltarla sin mirar reabría el
// doble cobro justo cuando la respuesta se perdió.
//
// El valor de la marca es la Idempotency-Key del intento: identifica el INTENTO,
// no el contenido. El mismo intento puede volver a entrar (reintento del step de
// Inngest, «Reintentar» tras un 503) durante `MINUTOS_REENTRADA`, y Stripe lo
// deduplica; pasado eso solo decide el conciliador.
//
// Sin alias `@/`: lo leen `node --test`, `stripe-cobros.ts` y el conciliador.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import { puedeIntentarCobro, type MarcaTrasCancelarCuota, type MotivoSinCobro, type ViaCobro } from './cobro-permitido.ts';
import { exigirCheckoutLeido } from './pago-online-al-cobrar-a-mano.ts';

/** El mismo intento vuelve a entrar sin escribir nada durante este tiempo. */
export const MINUTOS_REENTRADA = 10;
/**
 * Vida máxima de una llamada que cobra: `maxDuration` de la ruta de Inngest
 * (`app/api/inngest/route.ts`), la más larga de las que llaman a
 * `cobrarReciboOffSession`. Un test lo ata a esa ruta.
 */
export const SEGUNDOS_VIDA_MAXIMA_LLAMADA = 300;
/**
 * A partir de aquí solo decide el conciliador. Mayor que la reentrada más la vida
 * de una llamada: así quien llamó y el conciliador nunca actúan a la vez.
 */
export const MINUTOS_HUERFANA = 20;
/** Dónde puede haber nacido el PaymentIntent de un intento, respecto a `desde`. */
export const VENTANA_PI_ANTES_MS = 2 * 60_000;
export const VENTANA_PI_DESPUES_MS = 15 * 60_000;

/**
 * Idempotency-Key de un intento: recibo + nº de intento (`intentos_reintento`).
 * Anclarla solo al recibo rompía el dunning (cada reintento devolvía el mismo
 * PaymentIntent fallido); con el nº, cada reintento es un cargo nuevo y dos
 * disparadores del mismo intento siguen deduplicados.
 */
export function claveCobroOffSession(reciboId: string, intentos: number | null | undefined): string {
  return `offsession-cobro-${reciboId}-i${intentos ?? 0}`;
}

export interface MarcaCobroOffSession {
  clave: string;
  /** Tal como lo devuelve la base de datos: se compara con él para soltarla. */
  desde: string;
}

/** Lo que se relee del recibo cuando la reserva no gana. */
export const COLUMNAS_RELECTURA_RESERVA =
  'estado, intentos_reintento, proximo_reintento, tras_cancelar_cuota, cobro_off_session_clave, cobro_off_session_desde, '
  + 'cobro_mostrador_pi, checkout_session_id, reembolso_stripe_id, reembolso_solicitado_en';

export interface FilaReciboReserva {
  estado: string;
  intentos_reintento: number | null;
  proximo_reintento: string | null;
  tras_cancelar_cuota: string | null;
  cobro_off_session_clave: string | null;
  cobro_off_session_desde: string | null;
  cobro_mostrador_pi: string | null;
  checkout_session_id: string | null;
  reembolso_stripe_id: string | null;
  reembolso_solicitado_en: string | null;
}

export type CobroEnMarchaPor = 'OFF_SESSION' | 'MOSTRADOR' | 'PAGO_ONLINE';

export type ReservaPerdida =
  | { tipo: 'NO_ENCONTRADO' }
  /** La regla de siempre (`puedeIntentarCobro`) ya no deja cobrarlo. */
  | { tipo: 'SIN_PERMISO'; motivo: MotivoSinCobro }
  /** El MISMO intento, todavía joven: se sigue sin escribir (Stripe deduplica por la clave). */
  | { tipo: 'REENTRANTE'; marca: MarcaCobroOffSession }
  | { tipo: 'EN_MARCHA'; por: CobroEnMarchaPor }
  /** Cambió algo que no es un cobro (el nº de intento): no se ha cobrado nada; el siguiente intento lo repite. */
  | { tipo: 'CAMBIO' };

const edadMs = (iso: string | null, ahora: Date) => (iso ? ahora.getTime() - new Date(iso).getTime() : Number.POSITIVE_INFINITY);

/**
 * La reserva tocó 0 filas: ¿por qué? `fila` es el recibo releído justo después;
 * `cuota`, la que ya se leyó para decidir el cobro.
 */
export function clasificarReservaPerdida(
  fila: FilaReciboReserva | null,
  p: {
    clave: string; via: ViaCobro; cuota: { estado: string } | null; ahora: Date;
    /** El pago online que se leyó (y se cerró) justo antes de reservar; ver `CondicionesReserva.checkoutLeido`. */
    checkoutLeido?: string | null;
  },
): ReservaPerdida {
  if (!fila) return { tipo: 'NO_ENCONTRADO' };
  const permiso = puedeIntentarCobro({
    estado: fila.estado,
    proximoReintento: fila.proximo_reintento,
    trasCancelarCuota: (fila.tras_cancelar_cuota as MarcaTrasCancelarCuota | null) ?? null,
  }, p.cuota, p.via);
  if (!permiso.ok) return { tipo: 'SIN_PERMISO', motivo: permiso.motivo };
  // Un recibo al que se le está devolviendo el dinero no se cobra: su cierre lo rechazaría.
  if (fila.reembolso_stripe_id || fila.reembolso_solicitado_en) return { tipo: 'SIN_PERMISO', motivo: 'NO_PENDIENTE' };
  if (fila.cobro_off_session_clave) {
    const joven = edadMs(fila.cobro_off_session_desde, p.ahora) < MINUTOS_REENTRADA * 60_000;
    if (fila.cobro_off_session_clave === p.clave && joven && fila.cobro_off_session_desde) {
      return { tipo: 'REENTRANTE', marca: { clave: fila.cobro_off_session_clave, desde: fila.cobro_off_session_desde } };
    }
    return { tipo: 'EN_MARCHA', por: 'OFF_SESSION' };
  }
  if (fila.cobro_mostrador_pi) return { tipo: 'EN_MARCHA', por: 'MOSTRADOR' };
  if (p.via === 'AUTOMATICO' && fila.checkout_session_id) return { tipo: 'EN_MARCHA', por: 'PAGO_ONLINE' };
  // A mano: la clienta ha abierto OTRO pago online después de que se cerrara el
  // que se leyó. Ese puede estar pagándose ya. Que la columna esté vacía no es eso:
  // la suelta el conciliador cuando la sesión caduca (lib/billing/sesion-caducada.ts).
  if (p.checkoutLeido !== undefined && fila.checkout_session_id !== null && fila.checkout_session_id !== p.checkoutLeido) {
    return { tipo: 'EN_MARCHA', por: 'PAGO_ONLINE' };
  }
  return { tipo: 'CAMBIO' };
}

export const MENSAJE_COBRO_EN_MARCHA: Record<CobroEnMarchaPor, string> = {
  OFF_SESSION: 'Este recibo ya se está cobrando con su tarjeta o domiciliación guardada: no se ha vuelto a cobrar.',
  MOSTRADOR: 'Este recibo se está cobrando en el mostrador (datáfono o Bizum): no se ha cobrado con la tarjeta guardada.',
  PAGO_ONLINE: 'La clienta tiene abierto un pago online de este recibo: no se ha cobrado con la tarjeta guardada.',
};

/** Para quien cobra en el mostrador (datáfono, Bizum). */
export const MENSAJE_RECIBO_COBRANDOSE_CON_METODO_GUARDADO =
  'Este recibo se está cobrando ahora mismo con su tarjeta o domiciliación guardada: no lo cobres aquí. Vuelve a mirarlo en unos minutos.';

/** Para la clienta que abre el enlace de pago. */
export const MENSAJE_PAGO_ONLINE_COBRANDOSE_CON_METODO_GUARDADO =
  'Este recibo se está cobrando ahora mismo con tu tarjeta o domiciliación guardada. Vuelve a mirarlo en unos minutos.';

/** Para la clienta que vuelve a abrir el pago de un recibo que ya pagó online y aún no consta cobrado. */
export const MENSAJE_RECIBO_YA_PAGADO_ONLINE =
  'Este recibo ya está pagado: lo estamos confirmando. No hace falta que lo pagues otra vez.';

export const MENSAJE_RESERVA_SIN_CONFIRMAR =
  'No se ha podido preparar el cobro: no se ha cobrado nada. Vuelve a intentarlo en un momento.';

// ── Escrituras ──────────────────────────────────────────────────────────────

/** Lo que el recibo tenía que seguir siendo para reservarlo: lo mismo que exigirá su cierre. */
export interface CondicionesReserva {
  studioId: string;
  reciboId: string;
  clave: string;
  via: ViaCobro;
  /** El `intentos_reintento` leído, del que sale la clave. */
  intentos: number | null;
  ahoraISO: string;
  /**
   * A mano (STAFF): el `checkout_session_id` que se leyó y se CERRÓ en Stripe justo
   * antes (`soltarPagosEnMarchaAntesDeCobrar`). El UPDATE exige que siga siendo ese, o
   * ninguno (`exigirCheckoutLeido`): si entre medias la clienta abrió otro pago online,
   * no se cobra con su tarjeta guardada (lo podría estar pagando a la vez). Sin él
   * (undefined), no se mira la columna.
   */
  checkoutLeido?: string | null;
}

export type ResultadoReserva =
  | { tipo: 'RESERVADA'; marca: MarcaCobroOffSession }
  | { tipo: 'PERDIDA' }
  | { tipo: 'ERROR'; error: string };

/**
 * Reserva el recibo para este intento. Compare-and-set con las condiciones de
 * `puedeIntentarCobro` y de `estadosAdmitidosPorOrigen('off_session')`: si gana,
 * el cierre del cobro solo puede fallar porque algo cambió DESPUÉS.
 */
export async function reservarCobroOffSession(admin: SupabaseClient, c: CondicionesReserva): Promise<ResultadoReserva> {
  let q = admin.from('recibos')
    .update({ cobro_off_session_clave: c.clave, cobro_off_session_desde: c.ahoraISO })
    .eq('id', c.reciboId).eq('studio_id', c.studioId)
    .is('cobro_off_session_clave', null)
    // La otra mitad de la exclusión con el datáfono (que exige esta marca a null).
    .is('cobro_mostrador_pi', null)
    .is('reembolso_stripe_id', null)
    .is('reembolso_solicitado_en', null);
  // La clave sale del nº de intento leído: si cambió, la clave ya no es la de este recibo.
  q = c.intentos === null ? q.is('intentos_reintento', null) : q.eq('intentos_reintento', c.intentos);
  if (c.via === 'AUTOMATICO') {
    q = q.eq('estado', 'PENDIENTE')
      .not('proximo_reintento', 'is', null)
      .or('tras_cancelar_cuota.is.null,tras_cancelar_cuota.eq.REINTENTAR')
      // D-1, ahora en el propio UPDATE: con un pago online abierto, el cobro diario no cobra.
      .is('checkout_session_id', null);
  } else {
    q = q.in('estado', ['PENDIENTE', 'FALLIDO'])
      .or('tras_cancelar_cuota.is.null,tras_cancelar_cuota.neq.ANULADO');
    if (c.checkoutLeido !== undefined) q = exigirCheckoutLeido(q, c.checkoutLeido);
  }
  const { data, error } = await q.select('id, cobro_off_session_desde');
  if (error) return { tipo: 'ERROR', error: error.message };
  const fila = (data ?? [])[0] as { cobro_off_session_desde?: string | null } | undefined;
  if (!fila) return { tipo: 'PERDIDA' };
  return { tipo: 'RESERVADA', marca: { clave: c.clave, desde: fila.cobro_off_session_desde ?? c.ahoraISO } };
}

/**
 * Suelta la marca de ESTE intento (clave y momento): un rechazo, un 3DS que no se
 * puede completar, o el conciliador tras comprobar que no entró dinero. Nunca toca
 * el estado. Devuelve si la soltó.
 */
export async function soltarMarcaCobroOffSession(
  admin: SupabaseClient, p: { studioId: string; reciboId: string; marca: MarcaCobroOffSession },
): Promise<boolean> {
  const { data, error } = await admin.from('recibos')
    .update({ cobro_off_session_clave: null, cobro_off_session_desde: null })
    .eq('id', p.reciboId).eq('studio_id', p.studioId)
    .eq('cobro_off_session_clave', p.marca.clave).eq('cobro_off_session_desde', p.marca.desde)
    .select('id');
  return !error && (data?.length ?? 0) > 0;
}

/**
 * Adeudo SEPA en `processing`: el recibo pasa a EN_CURSO con su cargo y la marca
 * se quita en el MISMO UPDATE (desde aquí bloquea EN_CURSO, que ninguna puerta a
 * mano cierra). Compare-and-set sobre PENDIENTE/FALLIDO: si el recibo se anuló o
 * se cobró entre medias, no se pisa. Lo comparten el cobro síncrono y el conciliador.
 */
export async function marcarAdeudoEnCurso(
  admin: SupabaseClient, p: { studioId: string; reciboId: string; paymentIntentId: string },
): Promise<{ error: string | null; tocadas: number }> {
  const { data, error } = await admin.from('recibos')
    .update({
      estado: 'EN_CURSO', metodo_cobro: 'SEPA', sepa_estado: 'processing', stripe_payment_intent_id: p.paymentIntentId,
      cobro_off_session_clave: null, cobro_off_session_desde: null,
    })
    .eq('id', p.reciboId).eq('studio_id', p.studioId).in('estado', ['PENDIENTE', 'FALLIDO'])
    .select('id');
  return { error: error?.message ?? null, tocadas: data?.length ?? 0 };
}

// ── Desenlaces del cargo ─────────────────────────────────────────────────────

export type DesenlaceCargo =
  /** `succeeded`: lo quita `confirmarCobro` en el UPDATE a COBRADO. Si no puede, se queda (el dinero entró). */
  | 'COBRADO'
  /** SEPA `processing`: lo quita `marcarAdeudoEnCurso`. Si no puede, se queda (hay un adeudo en vuelo). */
  | 'ADEUDO_EN_CURSO'
  /** `requires_action` u otro estado sin dinero: se suelta. */
  | 'SIN_COBRAR'
  /** Rechazo de la tarjeta o petición inválida: se suelta. */
  | 'RECHAZADO'
  /** Red caída, 5xx, idempotencia en curso: el cargo pudo entrar. Se queda. */
  | 'DESCONOCIDO';

export type AccionMarca = 'LA_QUITA_EL_CIERRE' | 'SOLTAR' | 'MANTENER';

export const ACCION_MARCA_TRAS_DESENLACE: Record<DesenlaceCargo, AccionMarca> = {
  COBRADO: 'LA_QUITA_EL_CIERRE',
  ADEUDO_EN_CURSO: 'LA_QUITA_EL_CIERRE',
  SIN_COBRAR: 'SOLTAR',
  RECHAZADO: 'SOLTAR',
  DESCONOCIDO: 'MANTENER',
};

/**
 * El estado con el que vuelve un cargo creado y confirmado. Una TARJETA en
 * `processing` (o `requires_capture`) no es un rechazo: hay dinero en vuelo y lo
 * cerrará su webhook, así que la marca se queda.
 */
export function desenlaceDeEstadoPi(status: string, esSepa: boolean): DesenlaceCargo {
  if (status === 'succeeded') return 'COBRADO';
  if (status === 'processing' && esSepa) return 'ADEUDO_EN_CURSO';
  if (status === 'processing' || status === 'requires_capture') return 'DESCONOCIDO';
  return 'SIN_COBRAR';
}

// ── Marcas huérfanas (conciliador) ──────────────────────────────────────────

export interface PiDeMarca {
  id: string;
  status: string;
  /** Segundos Unix, como lo da Stripe. */
  created: number;
  metadata: Record<string, string> | null | undefined;
}

export type DecisionMarcaHuerfana =
  /** Aún puede estar resolviéndola quien llamó (o su reintento). */
  | { tipo: 'ESPERAR' }
  /** No entró dinero (o el recibo ya no se cobra): se suelta. */
  | { tipo: 'SOLTAR' }
  | { tipo: 'COBRADO'; paymentIntentId: string; metodo: 'TARJETA' | 'SEPA' }
  | { tipo: 'ADEUDO_EN_CURSO'; paymentIntentId: string }
  /** No se puede decidir sin mirar a mano (o aún no): se queda puesta. */
  | { tipo: 'MANTENER'; motivo: 'VARIOS_CARGOS' | 'CARGO_PROCESANDO' };

const ORIGENES_METODO_GUARDADO = new Set(['tarjeta_recibo', 'sepa_recibo']);
const CON_DINERO = new Set(['succeeded', 'processing', 'requires_capture']);

/** Dónde buscar el PaymentIntent de un intento (segundos Unix, como `created` de Stripe). */
export function ventanaDelIntento(desde: string): { gte: number; lte: number } {
  const t = new Date(desde).getTime();
  return { gte: Math.floor((t - VENTANA_PI_ANTES_MS) / 1000), lte: Math.ceil((t + VENTANA_PI_DESPUES_MS) / 1000) };
}

/**
 * Una marca que nadie ha quitado: ¿qué hizo Stripe con ese intento? `pis` son los
 * PaymentIntents de la cuenta que cubren su ventana (`ventanaDelIntento`).
 */
export function decidirMarcaHuerfana(
  recibo: { id: string; estado: string; desde: string },
  pis: readonly PiDeMarca[],
  ahora: Date,
): DecisionMarcaHuerfana {
  // El trigger la quita al salir de PENDIENTE/FALLIDO; esto cubre lo que quedara de antes.
  if (recibo.estado !== 'PENDIENTE' && recibo.estado !== 'FALLIDO') return { tipo: 'SOLTAR' };
  if (edadMs(recibo.desde, ahora) < MINUTOS_HUERFANA * 60_000) return { tipo: 'ESPERAR' };

  const { gte, lte } = ventanaDelIntento(recibo.desde);
  const suyos = pis.filter(pi => pi.metadata?.reciboId === recibo.id
    && ORIGENES_METODO_GUARDADO.has(pi.metadata?.origen ?? '')
    && pi.created >= gte && pi.created <= lte);
  const conDinero = suyos.filter(pi => CON_DINERO.has(pi.status));
  if (conDinero.length > 1) return { tipo: 'MANTENER', motivo: 'VARIOS_CARGOS' };
  const pi = conDinero[0];
  if (!pi) return { tipo: 'SOLTAR' };
  const esSepa = pi.metadata?.origen === 'sepa_recibo';
  if (pi.status === 'succeeded') return { tipo: 'COBRADO', paymentIntentId: pi.id, metodo: esSepa ? 'SEPA' : 'TARJETA' };
  if (pi.status === 'processing' && esSepa) return { tipo: 'ADEUDO_EN_CURSO', paymentIntentId: pi.id };
  return { tipo: 'MANTENER', motivo: 'CARGO_PROCESANDO' };
}

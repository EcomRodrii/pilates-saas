// ─────────────────────────────────────────────────────────────────────────────
// Las REGLAS de «este recibo está cobrado», sin base de datos ni Stripe.
//
// `confirmar-cobro.ts` es el único dueño de la transición a COBRADO; aquí vive
// lo que esa transición decide, en funciones puras, para poder fijarlo con
// `node --test` (confirmar-cobro y dunning-server no tenían ni un test).
//
// Módulo aparte y sin dependencias de servidor a propósito: el panel importa
// `refIdCreditoRenovacion` (lib/studio-context.tsx) y no puede arrastrar al
// bundle de cliente nada que acabe en `supabase-data-admin`.
// ─────────────────────────────────────────────────────────────────────────────
import type { EstadoRecibo } from '../types.ts';
import { ESTADOS_COBRABLES } from './deuda-recibo.ts';
import { emiteFacturaAutomatica } from '../factura-automatica.ts';

/**
 * Quién da el cobro por bueno.
 *  · `webhook` / `conciliador` / `tpv`: Stripe lo ha confirmado.
 *  · `off_session`: `cobrarReciboOffSession` acaba de ver el `succeeded`.
 *  · `manual`: alguien del estudio lo marca sin que nadie lo confirme.
 */
export type OrigenCobro = 'webhook' | 'conciliador' | 'tpv' | 'manual' | 'off_session';

/**
 * Desde qué estados puede pasar un recibo a COBRADO según quién lo confirme.
 *
 * - Lo que confirma Stripe acepta todo lo cobrable (`ESTADOS_COBRABLES`, la
 *   misma lista que deja pagar el checkout: si divergen, se cobra y no se
 *   entrega) MÁS `EN_CURSO`, que es el adeudo SEPA en vuelo que Stripe termina
 *   de liquidar. Cerrar un `EN_CURSO` exige además que sea con ESE mismo cargo
 *   (ver `filtroCargoEnCas`).
 * - `admitirDevuelto: false` quita DEVUELTO: lo usa el camino de SEPA/tarjeta
 *   guardada (`confirmarCobroExitoso`), que nunca lo admitió. Un adeudo se
 *   puede devolver semanas después, y un evento viejo no puede resucitarlo.
 * - `manual` NUNCA acepta `EN_CURSO`: hay un cargo en vuelo y marcarlo a mano
 *   encima es la puerta al doble cobro. Solo Stripe puede cerrar ese estado.
 * - `off_session` acepta exactamente lo que comprobó antes de cobrar
 *   (PENDIENTE/FALLIDO). Si el recibo cambió entre esa lectura y el cargo, no se
 *   pisa: se reporta.
 */
export function estadosAdmitidosPorOrigen(
  origen: OrigenCobro,
  opciones: { admitirDevuelto?: boolean } = {},
): EstadoRecibo[] {
  if (origen === 'off_session') return ['PENDIENTE', 'FALLIDO'];
  const base: EstadoRecibo[] = origen === 'manual' ? [...ESTADOS_COBRABLES] : [...ESTADOS_COBRABLES, 'EN_CURSO'];
  return opciones.admitirDevuelto === false ? base.filter(e => e !== 'DEVUELTO') : base;
}

export type ConciliadoPor = 'webhook' | 'conciliador' | 'tpv' | 'manual';

/**
 * Lo que se escribe en `recibos.conciliado_por`, en el MISMO UPDATE que marca
 * COBRADO. El CHECK vigente admite webhook/conciliador/manual/tpv
 * (migr 20260907174932): `off_session` no está y no se inventa un valor
 * parecido — se deja sin escribir, igual que hacía ese camino hasta ahora.
 * Añadirlo al CHECK es trabajo de una migración (PR 2).
 */
export function conciliadoPorDe(origen: OrigenCobro): ConciliadoPor | null {
  return origen === 'off_session' ? null : origen;
}

// Ids de Stripe (`pi_…`, `cs_…`): letras, dígitos y guion bajo. Lo que no
// encaje no se interpola en un filtro PostgREST.
const REFERENCIA_STRIPE = /^[A-Za-z0-9_]{1,255}$/;

/**
 * Filtro `.or()` del compare-and-set que ata DEVUELTO y EN_CURSO al cargo que
 * llega:
 *  · un DEVUELTO con ESTE mismo cargo no vuelve a COBRADO (reentrega tardía de
 *    un pago ya devuelto); con otro cargo, o sin cargo guardado, sí — pagar de
 *    nuevo una deuda devuelta por el banco (solo donde se admite DEVUELTO);
 *  · un EN_CURSO solo lo cierra el MISMO cargo que está en vuelo. Si el recibo
 *    no guarda cargo, se deja como estaba (lo cierra cualquiera): hoy todos los
 *    caminos que ponen EN_CURSO guardan el cargo, así que no debería darse.
 *  · el resto de estados, sin condición extra.
 *
 * `null` = sin cargo que comparar: no se añade filtro (mismo comportamiento que
 * antes para quien no aporta PaymentIntent). Un id con caracteres fuera de lo
 * esperado no se interpola: se excluyen DEVUELTO y EN_CURSO enteros.
 */
export function filtroCargoEnCas(paymentIntentId: string | null): string | null {
  if (!paymentIntentId) return null;
  if (!REFERENCIA_STRIPE.test(paymentIntentId)) return 'estado.not.in.(DEVUELTO,EN_CURSO)';
  const pi = paymentIntentId;
  return 'estado.not.in.(DEVUELTO,EN_CURSO),'
    + `and(estado.eq.DEVUELTO,or(stripe_payment_intent_id.is.null,stripe_payment_intent_id.neq.${pi})),`
    + `and(estado.eq.EN_CURSO,or(stripe_payment_intent_id.is.null,stripe_payment_intent_id.eq.${pi}))`;
}

export type FilaReciboSinCambios = { estado: string | null; stripe_payment_intent_id: string | null } | null;

export type DecisionSinFilas =
  | { tipo: 'no_encontrado' }
  /** Reentrega del mismo cobro (o el otro camino llegó antes): nada que hacer. */
  | { tipo: 'ya_estaba' }
  /** Ya devuelto con ESTE mismo cargo: nunca se resucita. */
  | { tipo: 'devuelto' }
  /** Cobrado, o en vuelo, con OTRO cargo: dinero cobrado dos veces. Se reporta. */
  | { tipo: 'otro_cobro'; anterior: string | null }
  /** Existe pero su estado (o un reembolso en curso) no admite este cobro. */
  | { tipo: 'no_cobrable'; estado: string | null };

/**
 * El compare-and-set tocó 0 filas: ¿por qué?
 *
 * `fila` es el recibo releído justo después. Sin cargo entrante no se puede
 * distinguir una reentrega de otro cobro, así que COBRADO se toma por
 * reentrega — que es lo que ya hacía cada camino por su cuenta.
 *
 * Un COBRADO SIN cargo guardado al que le llega uno es «otro cobro»: lo marcó
 * alguien a mano (o por otra vía sin Stripe) y además ha entrado un cargo. Un
 * EN_CURSO con un cargo en vuelo distinto del que llega, también.
 */
export function resolverSinFilas(fila: FilaReciboSinCambios, paymentIntentId: string | null): DecisionSinFilas {
  if (!fila) return { tipo: 'no_encontrado' };
  const anterior = fila.stripe_payment_intent_id ?? null;
  if (fila.estado === 'COBRADO') {
    if (!paymentIntentId || anterior === paymentIntentId) return { tipo: 'ya_estaba' };
    return { tipo: 'otro_cobro', anterior };
  }
  if (fila.estado === 'DEVUELTO' && paymentIntentId && anterior === paymentIntentId) {
    return { tipo: 'devuelto' };
  }
  if (fila.estado === 'EN_CURSO' && paymentIntentId && anterior && anterior !== paymentIntentId) {
    return { tipo: 'otro_cobro', anterior };
  }
  return { tipo: 'no_cobrable', estado: fila.estado };
}

export type PasoEfecto = 'renovacion' | 'factura' | 'caja' | 'creditos' | 'notificacion' | 'email';

/**
 * ¿Este camino avisa al estudio de que ha entrado dinero (PAGO_REALIZADO +
 * VENTA_REGISTRADA)? Decisión de producto: el refactor NO cambia qué avisos
 * recibe un estudio, así que es exactamente lo que hacía cada camino:
 *  · checkout (webhook y conciliador), TPV y compra web: sí;
 *  · cobro automático con tarjeta guardada (dunning, charge-off-session,
 *    cobrar-online, penalizaciones, ejecutor de decisiones): no;
 *  · a mano: el panel no lo emitía; cuando pase por aquí (PR 3) se decide.
 */
export function origenNotifica(origen: OrigenCobro): boolean {
  return origen === 'webhook' || origen === 'conciliador' || origen === 'tpv';
}

/**
 * Qué efectos tiene un cobro confirmado, y en qué orden. El orden importa:
 *  1. renovación — lo pagado se entrega antes que nada;
 *  2. factura — antes del email, para que el justificante lleve su número
 *     (el email lee la factura por `recibo_id`; `confirmarCobroExitoso`
 *     mandaba el email antes de sellar y salía sin número);
 *  3. caja — solo lo que pasa por el mostrador (`manual`/`tpv`);
 *  4. créditos RENOVACION_PLAN — solo si el recibo es una renovación;
 *  5. notificación (deduplicada por recibo en el motor de avisos), solo en los
 *     caminos que ya la emitían (`origenNotifica`);
 *  6. email — no es idempotente: solo quien ganó la transición lo pide.
 */
export function efectosEnOrden(p: {
  origen: OrigenCobro;
  metodo: string | null;
  avisarSocia: boolean;
  esRenovacion: boolean;
  renovar?: boolean;
  notificar?: boolean;
}): PasoEfecto[] {
  const pasos: PasoEfecto[] = [];
  if (p.renovar !== false) pasos.push('renovacion');
  if (emiteFacturaAutomatica(p.metodo)) pasos.push('factura');
  if (p.origen === 'manual' || p.origen === 'tpv') pasos.push('caja');
  if (p.esRenovacion) pasos.push('creditos');
  if (p.notificar !== false && origenNotifica(p.origen)) pasos.push('notificacion');
  if (p.avisarSocia) pasos.push('email');
  return pasos;
}

/**
 * Qué se vuelve a hacer cuando el cobro YA estaba (`ya_estaba`): solo el apunte
 * de caja del mostrador. Es idempotente (`mov-rec-<recibo>`, ON CONFLICT) y el
 * segundo camino que llega (TPV o webhook) lo repetía siempre, lo que reparaba
 * un apunte fallido. Nada de email ni de créditos.
 */
export function efectosEnReentrega(origen: OrigenCobro): PasoEfecto[] {
  return origen === 'manual' || origen === 'tpv' ? ['caja'] : [];
}

/**
 * ¿Este recibo es una RENOVACIÓN (y por tanto da créditos RENOVACION_PLAN)?
 *
 * Se decide por `recibos.es_renovacion`, la marca que pone quien lo crea (el
 * cron de renovaciones, `/api/public/renovar-plan`, el recibo de vencimiento del
 * panel) — el mismo criterio que ya usan `aplicarRenovacionServidor` (qué se
 * entrega) y el cron (a quién se le cobra solo). Nunca por el texto del
 * concepto, que es copy: «una decisión de dinero no puede depender de que nadie
 * lo traduzca» (migr 20260906003934).
 */
export function esRenovacion(recibo: { es_renovacion?: boolean | null } | null | undefined): boolean {
  return recibo?.es_renovacion === true;
}

/**
 * `ref_id` de los créditos RENOVACION_PLAN de un recibo: el propio id del
 * recibo. No es una elección libre: `otorgar_credito_disparador` exige
 * `recibos.id = p_ref_id` para ese disparador, y `reward_actions` tiene
 * UNIQUE (studio_id, trigger, ref_id). Que el panel y el servidor usen ESTE
 * mismo valor es lo que garantiza una sola concesión por recibo aunque se
 * marque cobrado en mostrador y además lo confirme Stripe.
 */
export function refIdCreditoRenovacion(reciboId: string): string {
  return reciboId;
}

// ── Id de la factura de cada canal ──────────────────────────────────────────
// El sellado deduplica por id y por `recibo_id`, pero la primera barrera es el
// id: dos caminos que sellan el MISMO recibo a la vez con ids distintos no
// chocan por PK. Cada canal usa siempre el suyo.

export const facturaIdCheckout = (reciboId: string) => `fac-checkout-${reciboId}`;

/** Tarjeta guardada o SEPA: el mismo id lo usan el cobro síncrono y su webhook. */
export const facturaIdMetodoGuardado = (reciboId: string, metodo: string) =>
  metodo === 'SEPA' ? `fac-sepa-${reciboId}` : `fac-off-${reciboId}`;

/**
 * Qué id usar al REINTENTAR el sellado de un recibo marcado
 * `factura_pendiente_sellar`. Antes se forzaba `fac-checkout-` para todos.
 *
 * Límite conocido: una tarjeta guardada RECUPERADA por el webhook
 * (`conciliado_por = 'webhook'`) no se distingue de un checkout con estas
 * columnas y cae en `fac-checkout-`. No duplica —el sellado busca también por
 * `recibo_id` y retoma una reserva incompleta—, pero persistir el id elegido
 * es trabajo de una migración (PR 2).
 */
export function facturaIdParaReintento(r: { id: string; metodo_cobro: string | null; conciliado_por: string | null }): string {
  if (r.id.startsWith('rec-pos-')) return `fac-pos-${r.id.slice('rec-pos-'.length)}`;
  if (r.metodo_cobro === 'SEPA') return `fac-sepa-${r.id}`;
  // Tarjeta guardada confirmada por el camino síncrono: no escribe
  // `conciliado_por` (ver `conciliadoPorDe`).
  if (r.conciliado_por == null) return `fac-off-${r.id}`;
  return facturaIdCheckout(r.id);
}

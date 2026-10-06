// ─────────────────────────────────────────────────────────────────────────────
// Un solo pago VIVO por persona y clase (P06 · Fase A, 6-oct-2026).
//
// El dueño de «el pago abierto de una clase» es la fila de `pagos_clase`
// (migr 20261006120000). Esta parte decide, sin red, qué hacer cuando alguien
// pide pagar una clase: crear un pago, reutilizar el que ya tiene abierto (mismo
// PaymentIntent: ni otra matrícula ni otro cupo), decirle que ya lo está pagando,
// o cancelar el anterior (contenido distinto: otro plan, otro código, otro sitio)
// antes de abrir otro. Sustituye al `intentoId` del cliente y a la clave que
// identificaba el intento con un hash: la clave de Stripe es el id de la fila.
//
// Puro y sin `@/`.
// ─────────────────────────────────────────────────────────────────────────────

export type EstadoPagoClase = 'ABIERTO' | 'CANCELADO' | 'PAGADO' | 'RESERVADA' | 'COMPENSADA' | 'REEMBOLSADA' | 'CERRADA';

/** Lo que identifica el CONTENIDO de un pago: si cambia algo, es otro pago. */
export interface ContenidoPagoClase {
  planId: string;
  codigoDescuentoId: string | null;
  spotId: string | null;
  /** El precio del plan tras el código, en céntimos (sin la matrícula: esa la decide la base al crear). */
  importeCentimos: number;
  /** `pi` = Payment Element (la hoja, /reservar); `cs` = Checkout hospedado (Bizum). */
  via: 'pi' | 'cs';
}

/** La fila tal como se lee de `pagos_clase`. */
export interface FilaPagoClase {
  id: string;
  estado: EstadoPagoClase | string;
  plan_id: string;
  codigo_descuento_id: string | null;
  spot_id: string | null;
  importe_centimos: number;
  matricula_centimos: number;
  cupo_matricula: boolean;
  referencia_stripe: string | null;
  payment_intent_id: string | null;
  creado_en: string;
}

/** Cuánto se espera a otra petición que está creando el cobro de la misma fila. */
export const SEGUNDOS_PREPARANDOSE = 60;

/** La clave de idempotencia de Stripe: el id de la fila (`-v3`, la generación que estrena esta regla). */
export function claveDePagoDeClase(filaId: string): string {
  return `checkout-embebido-v3-${filaId}`;
}

export function viaDeReferencia(ref: string | null | undefined): 'pi' | 'cs' | null {
  if (!ref) return null;
  if (ref.startsWith('pi_')) return 'pi';
  if (ref.startsWith('cs_')) return 'cs';
  return null;
}

export function mismoContenido(f: FilaPagoClase, c: ContenidoPagoClase): boolean {
  const viaFila = viaDeReferencia(f.referencia_stripe ?? f.payment_intent_id) ?? 'pi';
  return f.plan_id === c.planId
    && (f.codigo_descuento_id ?? null) === (c.codigoDescuentoId ?? null)
    && (f.spot_id ?? null) === (c.spotId ?? null)
    && Number(f.importe_centimos) === c.importeCentimos
    && viaFila === c.via;
}

export type DecisionPagoClase =
  /** No hay pago vivo: se crea fila nueva. */
  | 'crear'
  /** El mismo pago, con su cobro en Stripe todavía pagable: se devuelve ESE. */
  | 'reutilizar'
  /** El mismo pago, sin cobro creado y hace rato (la petición que lo creaba murió): se recrea con la MISMA clave. */
  | 'recrear'
  /** Otra petición está creando el cobro ahora mismo. */
  | 'preparandose'
  /** Ya lo ha pagado, o se está pagando (3DS, procesando): ni otro cobro ni el mismo otra vez. */
  | 'en-curso'
  /** Hay que mirar el cobro en Stripe antes de decidir. */
  | 'mirar-stripe'
  /** Contenido distinto (o el cobro ya está cancelado): se cancela el anterior y se abre otro. */
  | 'cancelar-y-crear'
  /** No se ha podido saber cómo está el cobro: no se crea otro. */
  | 'no-se-sabe';

const PAGANDOSE = new Set(['succeeded', 'processing', 'requires_action', 'requires_capture']);
const PAGABLE = new Set(['requires_payment_method', 'requires_confirmation']);

/**
 * `estadoStripe`: `undefined` = todavía no se ha mirado; `null` = se intentó y no se pudo.
 */
export function decidirPagoDeClase(
  fila: FilaPagoClase | null,
  contenido: ContenidoPagoClase,
  ahoraMs: number,
  estadoStripe?: string | null,
): DecisionPagoClase {
  if (!fila) return 'crear';
  if (fila.estado === 'PAGADO') return 'en-curso';
  if (fila.estado !== 'ABIERTO') return 'crear';
  const ref = fila.payment_intent_id ?? fila.referencia_stripe;
  if (!ref) {
    const edadSeg = (ahoraMs - new Date(fila.creado_en).getTime()) / 1000;
    if (edadSeg < SEGUNDOS_PREPARANDOSE) return 'preparandose';
    return mismoContenido(fila, contenido) ? 'recrear' : 'cancelar-y-crear';
  }
  if (estadoStripe === undefined) return 'mirar-stripe';
  if (estadoStripe === null) return 'no-se-sabe';
  if (estadoStripe === 'canceled') return 'cancelar-y-crear';
  if (PAGANDOSE.has(estadoStripe)) return 'en-curso';
  if (PAGABLE.has(estadoStripe)) return mismoContenido(fila, contenido) ? 'reutilizar' : 'cancelar-y-crear';
  // Un estado de Stripe que no conocemos (o un `cs_` en un estado raro): no se arriesga otro cobro.
  return 'no-se-sabe';
}

export const MENSAJE_PAGO_PREPARANDOSE = 'Estamos preparando tu pago. Un momento…';
export const MENSAJE_PAGO_DE_CLASE_EN_CURSO = 'Ya has pagado esta clase (o se está pagando). Estamos confirmando tu plaza: no vuelvas a pagar.';

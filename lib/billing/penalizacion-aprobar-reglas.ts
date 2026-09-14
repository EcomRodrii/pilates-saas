// ─────────────────────────────────────────────────────────────────────────────
// Aprobar a mano el cobro de una penalización: qué se escribe, qué se contesta
// y qué enseña la tarjeta de la home.
//
// Vive aquí, en una función pura, porque los tests unitarios no llegan a
// `app/api` y esta es una decisión de dinero con una trampa ya pisada:
//
//   Dos aprobaciones a la vez (doble toque, dos dispositivos). A cobra y deja el
//   recibo COBRADO. B había leído la penalización como pendiente, llega a
//   `cobrarReciboOffSession` con el recibo ya cobrado y recibe NO_PENDIENTE. La
//   ruta escribía entonces FALLIDA sin mirar en qué estado estaba la fila, y
//   pisaba la COBRADA de A: un cobro que entró de verdad quedaba como fallido.
//
// El doble CARGO ya lo impiden la Idempotency-Key y el guardia de estado del
// recibo (`lib/billing/stripe-cobros.ts`); esto arregla el REGISTRO:
//
//   1. Toda escritura es compare-and-set sobre el estado (`desde`), y la ruta
//      comprueba cuántas filas tocó.
//   2. Un «no se ha podido cobrar» que no sea transitorio vuelve a leer el
//      recibo antes de dar nada por fallido. Si el recibo está COBRADO, la
//      penalización pasa a COBRADA y se contesta 200 «ya estaba cobrada».
//   3. COBRADA no se pisa nunca. Lo único que puede escribir COBRADA sobre
//      FALLIDA es un cobro CONFIRMADO (recibo COBRADO): es corregir el registro
//      con lo que ha pasado con el dinero, no una opinión.
//
// Sin imports de servidor: la tarjeta del panel también lo usa.
// ─────────────────────────────────────────────────────────────────────────────

import type { ResultadoCobro } from './stripe-cobros.ts';
import type { AvisoCobro } from './resultado-cobro.ts';

/** `penalizaciones.estado` (CHECK de las migraciones 20260730225253 y 20260909220851). */
export type EstadoPenalizacion =
  | 'DETECTADA'
  | 'OMITIDA_SIN_TARJETA' | 'OMITIDA_SIN_CONSENTIMIENTO' | 'OMITIDA_COMPENSADA' | 'OMITIDA_REVERTIDA'
  | 'PENDIENTE_APROBACION' | 'RECIBO_CREADO' | 'COBRADA' | 'FALLIDA' | 'REEMBOLSADA';

/**
 * Desde dónde un cobro CONFIRMADO deja la penalización en COBRADA. Fuera quedan
 * COBRADA (ya está), REEMBOLSADA (el dinero volvió: la manda el webhook) y las
 * OMITIDA_* (se decidió no cobrar; si aun así entró, no se reescribe la
 * historia en silencio: la ruta contesta 202 y queda para revisar).
 */
export const ESTADOS_QUE_CORRIGE_UN_COBRO: readonly EstadoPenalizacion[] =
  ['DETECTADA', 'PENDIENTE_APROBACION', 'RECIBO_CREADO', 'FALLIDA'];

/** Solo lo que sigue pendiente de aprobar puede acabar FALLIDA desde aquí. */
const SOLO_PENDIENTE: readonly EstadoPenalizacion[] = ['PENDIENTE_APROBACION'];

export type TipoDesenlace =
  /** 200 · este intento ha cobrado (o ha salido el adeudo SEPA). */
  | 'COBRADA'
  /** 200 · ya estaba cobrada: no se ha vuelto a cobrar. */
  | 'YA_COBRADA'
  /** 202 · el dinero entró, pero no ha quedado registrado. */
  | 'COBRADA_SIN_REGISTRAR'
  /** 503 · no se sabe si entró; reintentar es seguro. */
  | 'SIN_CONFIRMAR'
  /** 402 · no se ha podido cobrar; la penalización queda fallida. */
  | 'RECHAZADA'
  /** 409 · no se puede cobrar (sin tarjeta); la penalización queda fallida. */
  | 'NO_COBRABLE'
  /** 409 · ya no está pendiente de aprobar (otra persona, otro proceso). */
  | 'NO_PENDIENTE';

export interface Desenlace {
  tipo: TipoDesenlace;
  http: 200 | 202 | 402 | 409 | 503;
  /** Texto para el cuerpo (`error`). Ausente en los 200. */
  mensaje?: string;
  /** Emitir PAGO_PENALIZACION (el motor deduplica por penalización). */
  notificar: boolean;
}

export interface Escritura {
  estado: 'COBRADA' | 'FALLIDA';
  /** Compare-and-set: solo se escribe si la fila está en uno de estos estados. */
  desde: readonly EstadoPenalizacion[];
}

export interface Plan {
  escritura: Escritura | null;
  desenlace: Desenlace;
}

/** Lo que devolvió la segunda lectura del recibo. `ok: false` = no se pudo leer. */
export type LecturaRecibo = { ok: true; estado: string | null } | { ok: false };

type Cobro = Pick<ResultadoCobro, 'ok' | 'aviso' | 'errorCode' | 'error' | 'status'>;

const NO_PENDIENTE = 'Esta penalización ya no está pendiente de aprobación.';
const SIN_CONFIRMAR = 'No hemos podido confirmar el cobro. Puedes reintentar: si ya entró, no se cobra dos veces.';
const SIN_REGISTRAR = 'Cobro completado en Stripe, pendiente de reconciliación manual.';
const COBRADA_SIN_MARCAR = 'El cobro ha entrado, pero la penalización no se ha podido marcar como cobrada. Revísala antes de volver a cobrarla.';
const QUEDA_FALLIDA = 'La penalización queda como no cobrada.';

function conPunto(texto: string): string {
  const t = texto.trim();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

const desenlaces = {
  cobrada: (): Desenlace => ({ tipo: 'COBRADA', http: 200, notificar: true }),
  yaCobrada: (): Desenlace => ({ tipo: 'YA_COBRADA', http: 200, notificar: false }),
  sinRegistrar: (mensaje: string): Desenlace => ({ tipo: 'COBRADA_SIN_REGISTRAR', http: 202, mensaje, notificar: false }),
  sinConfirmar: (): Desenlace => ({ tipo: 'SIN_CONFIRMAR', http: 503, mensaje: SIN_CONFIRMAR, notificar: false }),
  noPendiente: (mensaje = NO_PENDIENTE): Desenlace => ({ tipo: 'NO_PENDIENTE', http: 409, mensaje, notificar: false }),
};

/**
 * Antes de tocar Stripe. `null` = adelante. Una penalización ya COBRADA
 * contesta 200 «ya estaba cobrada» (el segundo toque que llega cuando el
 * primero ya terminó), no un 409 que suena a error.
 */
export function decidirAntesDeCobrar(pen: { estado: string; reciboId: string | null }): Desenlace | null {
  if (pen.estado === 'COBRADA') return desenlaces.yaCobrada();
  if (pen.estado !== 'PENDIENTE_APROBACION' || !pen.reciboId) return desenlaces.noPendiente();
  return null;
}

/**
 * ¿Hay que volver a leer el recibo antes de decidir? Siempre que el cobro no
 * haya salido y no sea transitorio: el NO_PENDIENTE de la carrera, pero también
 * un rechazo que llega mientras otra petición está cobrando el mismo recibo.
 */
export function hayQueReleerRecibo(cobro: Cobro): boolean {
  return !cobro.ok && cobro.errorCode !== 'ERROR_TRANSITORIO';
}

/** Resultado del cobro (+ recibo releído si hacía falta) → escritura y respuesta. */
export function planificarTrasCobro(cobro: Cobro, recibo?: LecturaRecibo): Plan {
  if (cobro.ok) {
    if (cobro.aviso === 'COBRADO_SIN_PERSISTIR') {
      // El dinero entró y el recibo no quedó marcado: FALLIDA para reconciliar
      // a mano (comportamiento de siempre), pero solo si seguía pendiente.
      return {
        escritura: { estado: 'FALLIDA', desde: SOLO_PENDIENTE },
        desenlace: desenlaces.sinRegistrar(cobro.error ?? SIN_REGISTRAR),
      };
    }
    return { escritura: { estado: 'COBRADA', desde: ESTADOS_QUE_CORRIGE_UN_COBRO }, desenlace: desenlaces.cobrada() };
  }

  // D-5: transitorio = desenlace desconocido. Sigue PENDIENTE_APROBACION para
  // poder reintentar con la MISMA Idempotency-Key.
  if (cobro.errorCode === 'ERROR_TRANSITORIO') return { escritura: null, desenlace: desenlaces.sinConfirmar() };

  // Sin saber cómo está el recibo no se da nada por fallido: podría estar
  // cobrado y un FALLIDA aquí es justo el bug.
  if (!recibo || !recibo.ok) return { escritura: null, desenlace: desenlaces.sinConfirmar() };

  if (recibo.estado === 'COBRADO') {
    return { escritura: { estado: 'COBRADA', desde: ESTADOS_QUE_CORRIGE_UN_COBRO }, desenlace: desenlaces.yaCobrada() };
  }
  // Adeudo SEPA en curso: el dinero está en camino y quien lo lanzó ya registra
  // la penalización. No se escribe nada.
  if (recibo.estado === 'EN_CURSO') {
    return { escritura: null, desenlace: desenlaces.noPendiente('Este cobro ya está en curso: no se ha vuelto a cobrar.') };
  }

  const detalle = `${conPunto(cobro.error ?? 'No se ha podido cobrar')} ${QUEDA_FALLIDA}`;
  const escritura: Escritura = { estado: 'FALLIDA', desde: SOLO_PENDIENTE };
  if (cobro.errorCode === 'NO_PENDIENTE') {
    return { escritura, desenlace: desenlaces.noPendiente(`Su recibo ya no está pendiente de cobro. ${QUEDA_FALLIDA}`) };
  }
  if (cobro.errorCode === 'SIN_TARJETA') {
    return { escritura, desenlace: { tipo: 'NO_COBRABLE', http: 409, mensaje: detalle, notificar: false } };
  }
  // El FALLO_COBRO del `catch` dice «Inténtalo de nuevo más tarde», y aquí la
  // fila se va: no se puede reintentar desde la home. Se cuenta lo que es.
  const mensaje = cobro.errorCode === 'FALLO_COBRO' && !cobro.status
    ? `No se ha podido cobrar con la tarjeta guardada. ${QUEDA_FALLIDA}`
    : detalle;
  return { escritura, desenlace: { tipo: 'RECHAZADA', http: 402, mensaje, notificar: false } };
}

/**
 * El compare-and-set no tocó ninguna fila (o dio error): otra petición u otro
 * proceso cambió la penalización entre medias. `estadoActual` es la relectura;
 * `null` si no se pudo leer.
 */
export function resolverEscrituraSinEfecto(plan: Plan, estadoActual: string | null): Desenlace {
  if (!plan.escritura) return plan.desenlace;
  const queriaCobrada = plan.escritura.estado === 'COBRADA';

  if (estadoActual === 'COBRADA') {
    // Otra petición llegó antes con el mismo desenlace: lo nuestro vale igual.
    // Si íbamos a escribir FALLIDA, COBRADA gana y se dice.
    return queriaCobrada ? plan.desenlace : desenlaces.yaCobrada();
  }
  // El dinero entró (recibo COBRADO) y la penalización no se ha podido marcar.
  if (queriaCobrada) return desenlaces.sinRegistrar(COBRADA_SIN_MARCAR);
  // Íbamos a dejarla FALLIDA tras un cobro que sí entró: eso sigue siendo cierto.
  if (plan.desenlace.http === 202) return plan.desenlace;
  // No se pudo releer: no se sabe en qué quedó. Reintentar vuelve a leerla.
  if (estadoActual === null) return desenlaces.sinConfirmar();
  return desenlaces.noPendiente();
}

/** Cuerpo JSON de la respuesta. `resultado` lo lee el cliente; `aviso` es el contrato de `leerAvisoCobro`. */
export function cuerpoRespuesta(d: Desenlace, statusStripe?: string): Record<string, unknown> {
  if (d.http === 200) return { ok: true, resultado: d.tipo, ...(statusStripe ? { status: statusStripe } : {}) };
  if (d.http === 202) {
    return { ok: true, resultado: d.tipo, aviso: 'COBRADO_SIN_PERSISTIR', error: d.mensaje, ...(statusStripe ? { status: statusStripe } : {}) };
  }
  return { error: d.mensaje, resultado: d.tipo };
}

// ── Lado de la tarjeta ──────────────────────────────────────────────────────

/** Lo que devuelve `aprobarPenalizacion` (lib/api-client.ts). Nunca lanza. */
export type AprobacionPenalizacion =
  | { ok: true; yaCobrada?: boolean; aviso?: AvisoCobro; detalle?: string }
  /** `status: 0` = sin respuesta legible (red caída, cuerpo que no es el esperado). */
  | { error: string; status: number };

export const TEXTO_COBRO_SIN_CONFIRMAR = SIN_CONFIRMAR;
const TEXTO_SIN_PERSISTIR_TARJETA = 'Se ha cobrado en Stripe, pero no ha quedado registrado: revísalo antes de volver a cobrarlo.';

/** Respaldo cuando el servidor no manda un texto apto. */
export function respaldoAprobacion(status: number): string | null {
  if (status === 402) return `No se ha podido cobrar. ${QUEDA_FALLIDA}`;
  if (status === 409) return NO_PENDIENTE;
  return null;
}

/**
 * Qué hace la fila con la respuesta. Se quita solo si la penalización ya no
 * está pendiente (terminal); si no se sabe qué pasó, se queda con el botón
 * activo, porque reintentar no cobra dos veces.
 */
export function queHaceLaTarjeta(r: AprobacionPenalizacion): { quitarFila: boolean; mensaje: string } {
  if ('error' in r) {
    // Sin respuesta o 5xx: el texto del servidor puede prometer un reintento
    // automático que en el camino manual no existe. Se dice lo que se sabe.
    if (r.status === 0 || r.status >= 500) return { quitarFila: false, mensaje: SIN_CONFIRMAR };
    return { quitarFila: r.status === 402 || r.status === 409, mensaje: r.error };
  }
  if (r.aviso === 'COBRADO_SIN_PERSISTIR') return { quitarFila: true, mensaje: r.detalle ?? TEXTO_SIN_PERSISTIR_TARJETA };
  if (r.yaCobrada) return { quitarFila: true, mensaje: 'Esta penalización ya estaba cobrada: no se ha vuelto a cobrar.' };
  return { quitarFila: true, mensaje: 'Cobro aprobado' };
}

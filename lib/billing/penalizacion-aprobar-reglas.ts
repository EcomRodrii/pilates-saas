// ─────────────────────────────────────────────────────────────────────────────
// Aprobar a mano el cobro de una penalización, y el cron que crea su recibo y
// la cobra en automático: qué se escribe, qué se contesta y qué enseña la
// tarjeta de la home.
//
// Vive aquí, en funciones puras, porque los tests unitarios no llegan a
// `app/api` ni a los crons, y esta es una decisión de dinero con una trampa ya
// pisada:
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
//   1. Toda escritura es compare-and-set sobre el estado (`desde`), y quien
//      escribe comprueba cuántas filas tocó.
//   2. Cualquier «no se ha podido cobrar» vuelve a leer el recibo antes de
//      decidir. Si el recibo está COBRADO, la penalización pasa a COBRADA.
//   3. COBRADA no se pisa nunca. Lo único que puede escribir COBRADA sobre
//      FALLIDA es un cobro CONFIRMADO (recibo COBRADO): es corregir el registro
//      con lo que ha pasado con el dinero, no una opinión.
//   4. Si Stripe no está listo (sin configurar, sin conectar, cuenta sin poder
//      cobrar) no se ha intentado cobrar: la penalización sigue pendiente.
//
// Sin imports de servidor: la tarjeta del panel y el cron también lo usan.
// ─────────────────────────────────────────────────────────────────────────────

import type { CobroErrorCode, ResultadoCobro } from './stripe-cobros.ts';
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

/**
 * Stripe no está listo para cobrar: el cargo NI SE INTENTÓ. `CUENTA_NO_LISTA`
 * cubre también un fallo de red al leer la cuenta Connect. Terminalizar aquí
 * dejaba la penalización FALLIDA para siempre por un problema de configuración.
 */
export const CODIGOS_STRIPE_NO_LISTO: readonly CobroErrorCode[] =
  ['NO_CONFIGURADO', 'MODO_STRIPE_CRUZADO', 'SIN_STRIPE_CONECTADO', 'CUENTA_NO_LISTA'];

export type TipoDesenlace =
  /** 200 · este intento ha cobrado (o ha salido el adeudo SEPA). */
  | 'COBRADA'
  /** 200 · el cobro entró, pero lo de después (renovar, sellar factura…) falló. */
  | 'COBRADA_INCOMPLETA'
  /** 200 · ya estaba cobrada: no se ha vuelto a cobrar. */
  | 'YA_COBRADA'
  /** 202 · el dinero entró, pero no ha quedado registrado. */
  | 'COBRADA_SIN_REGISTRAR'
  /** 503 · no se sabe si entró; reintentar es seguro. */
  | 'SIN_CONFIRMAR'
  /** 503 · no se ha intentado cobrar: Stripe no está listo. Sigue pendiente. */
  | 'STRIPE_NO_LISTO'
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
  /** Emitir PAGO_PENALIZACION (el motor deduplica por `pago-penalizacion:<id>`). */
  notificar: boolean;
}

export interface Escritura {
  estado: EstadoPenalizacion;
  /** Compare-and-set: solo se escribe si la fila está en uno de estos estados. */
  desde: readonly EstadoPenalizacion[];
}

export interface Plan {
  escritura: Escritura | null;
  desenlace: Desenlace;
}

/** Lo que devolvió la lectura del recibo. `ok: false` = no se pudo leer. */
export type LecturaRecibo = { ok: true; estado: string | null } | { ok: false };

export type Cobro = Pick<ResultadoCobro, 'ok' | 'aviso' | 'errorCode' | 'error' | 'status'>;

const NO_PENDIENTE = 'Esta penalización ya no está pendiente de aprobación.';
const SIN_CONFIRMAR = 'No hemos podido confirmar el cobro. Puedes reintentar: si ya entró, no se cobra dos veces.';
const SIN_REGISTRAR = 'Cobro completado en Stripe, pendiente de reconciliación manual.';
const COBRADA_SIN_MARCAR = 'El cobro ha entrado, pero la penalización no se ha podido marcar como cobrada. Revísala antes de volver a cobrarla.';
const QUEDA_FALLIDA = 'La penalización queda como no cobrada.';
const SIGUE_PENDIENTE = 'La penalización sigue pendiente.';

const STRIPE_NO_LISTO: Record<string, string> = {
  SIN_STRIPE_CONECTADO: `No se ha cobrado: este estudio no tiene Stripe conectado. Conéctalo en Configuración → Integraciones. ${SIGUE_PENDIENTE}`,
  CUENTA_NO_LISTA: `No se ha cobrado: no hemos podido confirmar que la cuenta de Stripe del estudio pueda cobrar. Revisa Configuración → Integraciones. ${SIGUE_PENDIENTE}`,
  // Estos dos son de Tentare, no del estudio: mandarla a Integraciones sería mentir.
  NO_CONFIGURADO: `No se ha cobrado: los cobros con tarjeta no están disponibles ahora mismo. No depende de tu estudio. ${SIGUE_PENDIENTE}`,
  MODO_STRIPE_CRUZADO: `No se ha cobrado: los cobros con tarjeta no están disponibles ahora mismo. No depende de tu estudio. ${SIGUE_PENDIENTE}`,
};

export const TEXTO_COBRADA_INCOMPLETA = 'Cobrado. No hemos podido completar el resto: revisa el recibo en Cobros.';

function conPunto(texto: string): string {
  const t = texto.trim();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

const desenlaces = {
  cobrada: (): Desenlace => ({ tipo: 'COBRADA', http: 200, notificar: true }),
  cobradaIncompleta: (): Desenlace => ({ tipo: 'COBRADA_INCOMPLETA', http: 200, notificar: true }),
  yaCobrada: (): Desenlace => ({ tipo: 'YA_COBRADA', http: 200, notificar: false }),
  sinRegistrar: (mensaje: string): Desenlace => ({ tipo: 'COBRADA_SIN_REGISTRAR', http: 202, mensaje, notificar: false }),
  sinConfirmar: (): Desenlace => ({ tipo: 'SIN_CONFIRMAR', http: 503, mensaje: SIN_CONFIRMAR, notificar: false }),
  stripeNoListo: (codigo: string): Desenlace =>
    ({ tipo: 'STRIPE_NO_LISTO', http: 503, mensaje: STRIPE_NO_LISTO[codigo] ?? STRIPE_NO_LISTO.NO_CONFIGURADO, notificar: false }),
  noPendiente: (mensaje = NO_PENDIENTE): Desenlace => ({ tipo: 'NO_PENDIENTE', http: 409, mensaje, notificar: false }),
};

/** Una FALLIDA puede estar cobrada de verdad: antes de contestar 409 se mira su recibo. */
export function hayQueLeerReciboAntesDeCobrar(pen: { estado: string; reciboId: string | null }): boolean {
  return pen.estado === 'FALLIDA' && !!pen.reciboId;
}

/**
 * Antes de tocar Stripe. `null` = adelante. Si devuelve un plan, se ejecuta y
 * se contesta sin cobrar.
 *
 * - COBRADA → 200 «ya estaba cobrada» (el segundo toque que llega cuando el
 *   primero ya terminó), no un 409 que suena a error.
 * - FALLIDA con el recibo COBRADO → COBRADA y 200. Pasa cuando la socia
 *   completó el 3DS desde un enlace de pago, o cuando el webhook cerró un
 *   COBRADO_SIN_PERSISTIR: el recibo se arregló y la penalización no.
 */
export function decidirAntesDeCobrar(pen: { estado: string; reciboId: string | null }, recibo?: LecturaRecibo): Plan | null {
  if (pen.estado === 'COBRADA') return { escritura: null, desenlace: desenlaces.yaCobrada() };
  if (pen.estado === 'FALLIDA' && pen.reciboId && recibo?.ok && recibo.estado === 'COBRADO') {
    return { escritura: { estado: 'COBRADA', desde: ['FALLIDA'] }, desenlace: desenlaces.yaCobrada() };
  }
  if (pen.estado !== 'PENDIENTE_APROBACION' || !pen.reciboId) return { escritura: null, desenlace: desenlaces.noPendiente() };
  return null;
}

/**
 * ¿Hay que volver a leer el recibo? Siempre que el cobro no haya salido: el
 * NO_PENDIENTE de la carrera, un rechazo mientras otra petición cobra el mismo
 * recibo, y también el transitorio — una excepción DESPUÉS de un cobro que sí
 * entró (sellar la factura, renovar) llega como ERROR_TRANSITORIO con el
 * recibo ya COBRADO.
 */
export function hayQueReleerRecibo(cobro: Cobro): boolean {
  return !cobro.ok;
}

/**
 * Resultado del cobro (+ recibo releído si hacía falta) → escritura y respuesta.
 *
 * Matices que se quedan como están, a propósito:
 * - SEPA `processing`: llega como `ok` y se registra COBRADA con 200, aunque el
 *   adeudo tarde días y pueda devolverse. Si se devuelve, lo cierra el webhook,
 *   no esta ruta.
 * - Recibo `EN_CURSO` (un adeudo o una remesa ya lo están cobrando): no se
 *   escribe y se contesta 409. La penalización sigue PENDIENTE_APROBACION y
 *   reaparece al recargar; cuando el recibo quede COBRADO, el siguiente
 *   «Aprobar» la cierra como «ya estaba cobrada» sin cobrar otra vez.
 */
export function planificarTrasCobro(
  cobro: Cobro,
  recibo?: LecturaRecibo,
  /** De qué estado sale una FALLIDA: PENDIENTE_APROBACION (aprobación a mano) o RECIBO_CREADO (cron automático). */
  pendiente: EstadoPenalizacion = 'PENDIENTE_APROBACION',
): Plan {
  if (cobro.ok) {
    if (cobro.aviso === 'COBRADO_SIN_PERSISTIR') {
      // El dinero entró y el recibo no quedó marcado: FALLIDA para reconciliar
      // a mano (comportamiento de siempre), pero solo si seguía pendiente.
      return {
        escritura: { estado: 'FALLIDA', desde: [pendiente] },
        desenlace: desenlaces.sinRegistrar(cobro.error ?? SIN_REGISTRAR),
      };
    }
    return { escritura: { estado: 'COBRADA', desde: ESTADOS_QUE_CORRIGE_UN_COBRO }, desenlace: desenlaces.cobrada() };
  }

  const reciboCobrado = recibo?.ok === true && recibo.estado === 'COBRADO';

  if (cobro.errorCode === 'ERROR_TRANSITORIO') {
    // Recibo COBRADO tras un transitorio: el cargo entró y lo que falló fue lo
    // de después. Se dice «cobrado» y se avisa a la socia (deduplicado). Si lo
    // cobró otra petición a la vez es el mismo PaymentIntent (misma clave), así
    // que «cobrado» sigue siendo cierto.
    if (reciboCobrado) {
      return { escritura: { estado: 'COBRADA', desde: ESTADOS_QUE_CORRIGE_UN_COBRO }, desenlace: desenlaces.cobradaIncompleta() };
    }
    // D-5: desenlace desconocido. Sigue pendiente para poder reintentar con la
    // MISMA Idempotency-Key.
    return { escritura: null, desenlace: desenlaces.sinConfirmar() };
  }

  if (reciboCobrado) {
    return { escritura: { estado: 'COBRADA', desde: ESTADOS_QUE_CORRIGE_UN_COBRO }, desenlace: desenlaces.yaCobrada() };
  }

  if (cobro.errorCode && CODIGOS_STRIPE_NO_LISTO.includes(cobro.errorCode)) {
    return { escritura: null, desenlace: desenlaces.stripeNoListo(cobro.errorCode) };
  }

  // Sin saber cómo está el recibo no se da nada por fallido: podría estar
  // cobrado y un FALLIDA aquí es justo el bug.
  if (!recibo || !recibo.ok) return { escritura: null, desenlace: desenlaces.sinConfirmar() };

  if (recibo.estado === 'EN_CURSO') {
    return { escritura: null, desenlace: desenlaces.noPendiente('Este cobro ya está en curso: no se ha vuelto a cobrar.') };
  }

  const detalle = `${conPunto(cobro.error ?? 'No se ha podido cobrar')} ${QUEDA_FALLIDA}`;
  const escritura: Escritura = { estado: 'FALLIDA', desde: [pendiente] };
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

// ── El cron (lib/inngest/penalizaciones.ts) ─────────────────────────────────
//
// Mismo compare-and-set sobre la penalización: dos pasadas solapadas no pueden
// devolver una COBRADA a PENDIENTE_APROBACION, ni tocar una penalización que el
// trigger acaba de revertir (OMITIDA_REVERTIDA) entre su SELECT y su UPDATE.
//
// ⚠️ Pero lo que se cobra es el RECIBO, y el dunning (lib/inngest/dunning.ts)
// cobra CUALQUIER recibo PENDIENTE con `proximo_reintento` vencido, sin mirar la
// penalización. Por eso el recibo nace SIEMPRE sin `proximo_reintento` y solo
// se arma cuando cobrar ya está decidido: modo automático y la penalización ya
// en RECIBO_CREADO. Antes nacía armado en automático: si el trigger la revertía
// entre el SELECT y el UPDATE, el CAS no tocaba nada y el cron salía… y el
// dunning cobraba igual una penalización revertida, sin rastro en su registro.
//
// Límite conocido (sin migración): el trigger de no-show solo revierte desde
// DETECTADA o PENDIENTE_APROBACION, y nunca toca recibos.
// - Revertida desde PENDIENTE_APROBACION: su recibo sigue PENDIENTE en Cobros
//   sin penalización detrás, pero sin `proximo_reintento`, así que el dunning
//   no lo cobra. Hay que anularlo a mano.
// - Desde RECIBO_CREADO el trigger no revierte nada: en automático el cobro ya
//   está decidido y el recibo armado. Corregir la asistencia después exige
//   anular o devolver a mano, que es lo que el propio trigger ya asume.

/** Toda salida de DETECTADA (omitida, fallida, recibo creado, pendiente) exige que siga DETECTADA. */
export const DESDE_DETECTADA: readonly EstadoPenalizacion[] = ['DETECTADA'];

/** Tras crear el recibo: RECIBO_CREADO (automático) o PENDIENTE_APROBACION (manual), solo desde DETECTADA. */
export function escrituraAlCrearRecibo(automatico: boolean): Escritura {
  return { estado: automatico ? 'RECIBO_CREADO' : 'PENDIENTE_APROBACION', desde: DESDE_DETECTADA };
}

export type OrigenRecibo = 'CREADO' | 'YA_EXISTIA' | 'ERROR';

/** Resultado del INSERT del recibo de id determinista. 23505 = ya existía de una pasada anterior. */
export function origenDelRecibo(error: { code?: string } | null | undefined): OrigenRecibo {
  if (!error) return 'CREADO';
  return error.code === '23505' ? 'YA_EXISTIA' : 'ERROR';
}

/**
 * ¿Entra el recibo en el dunning? Solo cuando cobrar está decidido: modo
 * automático y la penalización ya enlazada (CAS aplicado). En manual nunca: el
 * estudio revisa cada cargo, y el dunning lo cobraría solo.
 */
export function reciboEntraEnDunning(p: { automatico: boolean; casAplicado: boolean }): boolean {
  return p.automatico && p.casAplicado;
}

/** Lectura de `penalizaciones.recibo_id`. `ok: false` = no se pudo leer. */
export type LecturaPuntero = { ok: true; reciboId: string | null } | { ok: false };
export type LimpiezaRecibo = 'BORRAR' | 'DESARMAR' | 'NADA';

/**
 * El CAS desde DETECTADA no tocó nada: la penalización ya no es de esta pasada.
 * - Si la penalización apunta a este recibo, otra pasada lo tomó: no se toca.
 * - Si no se pudo leer, tampoco: ante la duda no se borra nada.
 * - Creado en ESTA pasada y sin nadie que apunte a él → se borra (la consulta
 *   exige además que siga PENDIENTE y sin armar).
 * - Ya existía (23505) → NUNCA se borra. Solo se desarma, por si nació armado
 *   con el código anterior.
 */
export function limpiezaTrasCasFallido(p: { origen: 'CREADO' | 'YA_EXISTIA'; reciboId: string; puntero: LecturaPuntero }): LimpiezaRecibo {
  if (!p.puntero.ok || p.puntero.reciboId === p.reciboId) return 'NADA';
  return p.origen === 'CREADO' ? 'BORRAR' : 'DESARMAR';
}

/** Cómo quedó el recibo cuando armarlo no tocó fila. `ok: false` = no se pudo leer. */
export type LecturaArmado = { ok: true; estado: string | null; armado: boolean } | { ok: false };

/** Alertas del cron a Sentry. Van solo con ids, nunca con datos de la socia. */
export type AlertaCron = 'NO_SE_PUDO_ARMAR' | 'RECIBO_NO_PENDIENTE_AL_ARMAR' | 'NO_SE_PUDO_DEVOLVER';

export type TrasArmar =
  | { accion: 'COBRAR'; alerta: AlertaCron | null }
  | { accion: 'DEVOLVER_A_DETECTADA'; alerta: AlertaCron };

/** Vuelta atrás cuando no se pudo armar: la próxima pasada del cron la recoge entera. */
export const VUELTA_A_DETECTADA: Escritura = { estado: 'DETECTADA', desde: ['RECIBO_CREADO'] };

/** Los estados de recibo que el guardia de `cobrarReciboOffSession` deja cobrar. */
const RECIBO_COBRABLE = ['PENDIENTE', 'FALLIDO'];

/**
 * Armar el recibo no confirmó una fila: ¿se cobra igual? Solo si no puede quedar
 * nada que nadie reintente.
 * - Armado (una fila), o ya lo estaba (código anterior) → cobrar: si el cobro
 *   sale transitorio, lo retoma el dunning.
 * - El recibo ya no es cobrable (cobrado o anulado a mano, borrado) → se intenta
 *   igual: el guardia del recibo no cobra, y la relectura deja la penalización
 *   COBRADA o FALLIDA. Con alerta, porque no debería pasar.
 * - Error, no se pudo leer, o sigue cobrable sin armar → NO se cobra. Un
 *   transitorio dejaría RECIBO_CREADO con el recibo sin armar, y eso no lo
 *   reintenta nadie: el cron solo lee DETECTADA y el dunning solo cobra recibos
 *   armados. Se desarma, se devuelve a DETECTADA y la próxima pasada lo repite
 *   entero (23505 → enlazar → armar → cobrar), con la misma Idempotency-Key.
 */
export function decidirTrasArmar(armado: { error: boolean; tocadas: number }, lectura?: LecturaArmado): TrasArmar {
  if (!armado.error && armado.tocadas > 0) return { accion: 'COBRAR', alerta: null };
  if (lectura?.ok) {
    if (lectura.estado === 'PENDIENTE' && lectura.armado) return { accion: 'COBRAR', alerta: null };
    if (!RECIBO_COBRABLE.includes(lectura.estado ?? '')) return { accion: 'COBRAR', alerta: 'RECIBO_NO_PENDIENTE_AL_ARMAR' };
  }
  return { accion: 'DEVOLVER_A_DETECTADA', alerta: 'NO_SE_PUDO_ARMAR' };
}

/**
 * Tras el cobro automático: las MISMAS reglas que la aprobación a mano, saliendo
 * de RECIBO_CREADO.
 * - Transitorio, Stripe no listo o recibo ilegible → no se escribe. Sigue
 *   RECIBO_CREADO con el recibo armado, y lo reintenta el DUNNING (el cron solo
 *   lee DETECTADA), con la misma Idempotency-Key porque el contador de intentos
 *   no se movió.
 * - Recibo COBRADO → COBRADA y aviso (deduplicado).
 * - Rechazo real → FALLIDA, como siempre.
 *
 * ⚠️ PENDIENTE, fuera de este cambio: tras un rechazo real la penalización queda
 * FALLIDA, pero su recibo sigue armado y el dunning lo reintenta. Si el dunning
 * lo cobra después, la penalización se queda FALLIDA con el dinero dentro (y
 * una RECIBO_CREADO que cobre el dunning se queda RECIBO_CREADO). El dunning
 * (lib/inngest/dunning.ts) tiene que actualizar la penalización de los recibos
 * `rec-penaliz-*` al cobrarlos. Hay que resolverlo ANTES de que ningún estudio
 * active el cobro automático de penalizaciones.
 */
export function planificarCobroAutomatico(cobro: Cobro, recibo?: LecturaRecibo): Plan {
  return planificarTrasCobro(cobro, recibo, 'RECIBO_CREADO');
}

/** Acceso a datos del cron, inyectado para probar el orden sin Supabase ni Stripe. */
export interface IoCronPenalizacion {
  /** INSERT del recibo determinista, SIEMPRE con `proximo_reintento: null`. Devuelve el error o null. */
  insertarRecibo(): Promise<{ code?: string } | null>;
  /** CAS de la penalización a `e.estado`, enlazando `recibo_id`. */
  enlazarRecibo(e: Escritura): Promise<{ error: boolean; tocadas: number }>;
  leerPunteroRecibo(): Promise<LecturaPuntero>;
  /** DELETE del recibo, solo si sigue PENDIENTE y sin armar. */
  borrarRecibo(): Promise<void>;
  /** `proximo_reintento = null`, solo si sigue PENDIENTE. */
  desarmarRecibo(): Promise<void>;
  /** `proximo_reintento = ahora`, solo si sigue PENDIENTE y sin armar. Devuelve las filas tocadas. */
  armarRecibo(): Promise<{ error: boolean; tocadas: number }>;
  /** Estado del recibo y si tiene `proximo_reintento`, cuando armar no tocó fila. */
  leerArmadoRecibo(): Promise<LecturaArmado>;
  /** CAS de la penalización a `e.estado` sin tocar `procesada_en` (la vuelta a DETECTADA). */
  devolverPenalizacion(e: Escritura): Promise<{ error: boolean; tocadas: number }>;
  cobrar(): Promise<Cobro>;
  leerRecibo(): Promise<LecturaRecibo>;
  /** CAS de la penalización a `e.estado`, con `procesada_en`. */
  cerrarPenalizacion(e: Escritura): Promise<{ error: boolean; tocadas: number }>;
  leerEstadoPenalizacion(): Promise<string | null>;
  notificarPago(): Promise<void>;
  /** Aviso a Sentry, solo con ids. */
  alertar(motivo: AlertaCron): void;
}

export type PasadaCron =
  | { paso: 'ERROR_RECIBO' }
  | { paso: 'ERROR_ENLACE' }
  | { paso: 'YA_NO_DETECTADA'; limpieza: LimpiezaRecibo }
  | { paso: 'ESPERA_APROBACION' }
  | { paso: 'SIN_ARMAR'; devuelta: boolean }
  | { paso: 'COBRO'; desenlace: Desenlace };

/** Crear el recibo de una penalización DETECTADA y, en automático, cobrarlo. */
export async function crearReciboYCobrar(io: IoCronPenalizacion, p: { reciboId: string; automatico: boolean }): Promise<PasadaCron> {
  const origen = origenDelRecibo(await io.insertarRecibo());
  if (origen === 'ERROR') return { paso: 'ERROR_RECIBO' };

  const enlace = await io.enlazarRecibo(escrituraAlCrearRecibo(p.automatico));
  // Error en el UPDATE: se sale sin cobrar. El recibo queda sin armar, así que
  // nada lo cobra; el próximo barrido reinserta (23505) y repite el UPDATE.
  if (enlace.error) return { paso: 'ERROR_ENLACE' };
  if (enlace.tocadas === 0) {
    const limpieza = limpiezaTrasCasFallido({ origen, reciboId: p.reciboId, puntero: await io.leerPunteroRecibo() });
    if (limpieza === 'BORRAR') await io.borrarRecibo();
    if (limpieza === 'DESARMAR') await io.desarmarRecibo();
    return { paso: 'YA_NO_DETECTADA', limpieza };
  }
  if (!reciboEntraEnDunning({ automatico: p.automatico, casAplicado: true })) {
    // Manual: el recibo no puede quedar cobrable por el dunning. Uno nuevo nace
    // sin armar; uno que ya existía pudo armarlo el código anterior (o el
    // estudio pasó de automático a manual entre pasadas), así que se desarma.
    if (origen === 'YA_EXISTIA') await io.desarmarRecibo();
    return { paso: 'ESPERA_APROBACION' };
  }

  // Se arma ANTES de cobrar: si el proceso muere después, el dunning lo retoma.
  // Si muere ENTRE enlazar y armar, no hay código que lo recoja: lo cuenta la
  // comprobación de salud `penalizaciones-recibo-sin-programar`.
  const armado = await io.armarRecibo();
  const lecturaArmado = armado.error || armado.tocadas === 0 ? await io.leerArmadoRecibo() : undefined;
  const tras = decidirTrasArmar(armado, lecturaArmado);
  if (tras.alerta) io.alertar(tras.alerta);
  if (tras.accion === 'DEVOLVER_A_DETECTADA') {
    // Primero desarmar (un recibo armado del código anterior no puede quedar
    // cobrable con la penalización en DETECTADA), luego devolver.
    await io.desarmarRecibo();
    const vuelta = await io.devolverPenalizacion(VUELTA_A_DETECTADA);
    const devuelta = !vuelta.error && vuelta.tocadas > 0;
    if (!devuelta) io.alertar('NO_SE_PUDO_DEVOLVER');
    return { paso: 'SIN_ARMAR', devuelta };
  }

  const cobro = await io.cobrar();
  const recibo = hayQueReleerRecibo(cobro) ? await io.leerRecibo() : undefined;
  const plan = planificarCobroAutomatico(cobro, recibo);
  let desenlace = plan.desenlace;
  if (plan.escritura) {
    const cierre = await io.cerrarPenalizacion(plan.escritura);
    if (cierre.error || cierre.tocadas === 0) desenlace = resolverEscrituraSinEfecto(plan, await io.leerEstadoPenalizacion());
  }
  if (desenlace.notificar) await io.notificarPago();
  return { paso: 'COBRO', desenlace };
}

// ── Lado de la tarjeta ──────────────────────────────────────────────────────

/** Lo que devuelve `aprobarPenalizacion` (lib/api-client.ts). Nunca lanza. */
export type AprobacionPenalizacion =
  | { ok: true; yaCobrada?: boolean; incompleta?: boolean; aviso?: AvisoCobro; detalle?: string }
  /** `status: 0` = sin respuesta legible (red caída, cuerpo que no es el esperado). */
  | { error: string; status: number; resultado?: string };

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
    // Stripe no está listo: sigue pendiente y el texto del servidor dice qué
    // revisar. Nada se ha cobrado.
    if (r.resultado === 'STRIPE_NO_LISTO') return { quitarFila: false, mensaje: r.error };
    // Sin respuesta o 5xx: el texto del servidor puede prometer un reintento
    // automático que en el camino manual no existe. Se dice lo que se sabe.
    if (r.status === 0 || r.status >= 500) return { quitarFila: false, mensaje: SIN_CONFIRMAR };
    return { quitarFila: r.status === 402 || r.status === 409, mensaje: r.error };
  }
  if (r.aviso === 'COBRADO_SIN_PERSISTIR') return { quitarFila: true, mensaje: r.detalle ?? TEXTO_SIN_PERSISTIR_TARJETA };
  if (r.incompleta) return { quitarFila: true, mensaje: TEXTO_COBRADA_INCOMPLETA };
  if (r.yaCobrada) return { quitarFila: true, mensaje: 'Esta penalización ya estaba cobrada: no se ha vuelto a cobrar.' };
  return { quitarFila: true, mensaje: 'Cobro aprobado' };
}

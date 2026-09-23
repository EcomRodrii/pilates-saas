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
//   3. COBRADA no se pisa nunca desde aquí. Lo único que puede escribir COBRADA
//      sobre FALLIDA es un cobro CONFIRMADO (recibo COBRADO): es corregir el
//      registro con lo que ha pasado con el dinero, no una opinión. (La única
//      salida de COBRADA a FALLIDA es un recibo que acaba FALLIDO, un adeudo
//      SEPA que no llegó a entrar, y la escribe `seguirAlRecibo`, más abajo.)
//   4. Si Stripe no está listo (sin configurar, sin conectar, cuenta sin poder
//      cobrar) no se ha intentado cobrar: la penalización sigue pendiente.
//
// Sin imports de servidor: la tarjeta del panel y el cron también lo usan.
// ─────────────────────────────────────────────────────────────────────────────

import type { CobroErrorCode, ResultadoCobro } from './stripe-cobros.ts';
import type { AvisoCobro } from './resultado-cobro.ts';
import type { MotivoSinConsentimiento } from './penalizacion-consentimiento.ts';

/** `penalizaciones.estado` (CHECK de las migraciones 20260730225253 y 20260909220851). */
export type EstadoPenalizacion =
  | 'DETECTADA'
  | 'OMITIDA_SIN_TARJETA' | 'OMITIDA_SIN_CONSENTIMIENTO' | 'OMITIDA_COMPENSADA' | 'OMITIDA_REVERTIDA'
  | 'OMITIDA_SIN_CUOTA'
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
  | 'NO_PENDIENTE'
  /** 409 · el contrato que aceptó no recoge este cargo: no se cobra y queda OMITIDA_SIN_CONSENTIMIENTO. */
  | 'SIN_CONSENTIMIENTO'
  /** Solo el cron automático · adeudo SEPA saliendo: no se da por cobrada hasta que el recibo quede COBRADO. */
  | 'ADEUDO_EN_CURSO';

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
  /**
   * En la misma escritura, `recibo_id = null`: el recibo se va a borrar y la FK
   * (`penalizaciones.recibo_id`, sin ON DELETE) no lo deja mientras apunte a él.
   */
  soltarRecibo?: true;
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
  SIN_STRIPE_CONECTADO: `No se ha cobrado: este estudio no tiene Stripe conectado. Conéctalo en Configuración → Cobros y facturas. ${SIGUE_PENDIENTE}`,
  CUENTA_NO_LISTA: `No se ha cobrado: no hemos podido confirmar que la cuenta de Stripe del estudio pueda cobrar. Revísala en Configuración → Cobros y facturas. ${SIGUE_PENDIENTE}`,
  // Estos dos son de Tentare, no del estudio: mandarla a su configuración sería mentir.
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
  adeudoEnCurso: (): Desenlace => ({ tipo: 'ADEUDO_EN_CURSO', http: 200, notificar: false }),
};

const SIN_CONSENTIMIENTO: Record<MotivoSinConsentimiento, string> = {
  texto_distinto: 'No se ha cobrado: esta alumna no ha aceptado las condiciones vigentes de tu estudio, así que el contrato no recoge este cargo.',
  terminos_propios: 'No se ha cobrado: tu estudio usa sus propias condiciones y no podemos comprobar que recojan este cargo.',
  estudio_sin_penalizacion: 'No se ha cobrado: el contrato que aceptó esta alumna no recoge ningún cargo por cancelar tarde o no venir.',
  importe_distinto: 'No se ha cobrado: el contrato que aceptó esta alumna no recoge este importe, solo el del estudio.',
  ventana_distinta: 'No se ha cobrado: según el plazo del contrato que aceptó esta alumna, esta cancelación no fue tardía.',
  sin_datos: 'No se ha cobrado: no hemos podido comprobar que el contrato que aceptó esta alumna recoja este cargo.',
};

/** Lo que dice la tarjeta cuando el contrato no cubre el cargo. */
export function mensajeSinConsentimiento(motivo: MotivoSinConsentimiento): string {
  return `${SIN_CONSENTIMIENTO[motivo] ?? SIN_CONSENTIMIENTO.sin_datos} La penalización queda sin cobrar.`;
}

/**
 * Aprobar a mano con un contrato que no recoge el cargo (las condiciones
 * pudieron cambiar entre la detección y la aprobación): no se toca Stripe, la
 * penalización sale de PENDIENTE_APROBACION a OMITIDA_SIN_CONSENTIMIENTO soltando
 * su recibo, la ruta lo borra (`cerrarSinConsentimiento`) y la fila se va de la
 * tarjeta (409). Sin soltarlo, el recibo PENDIENTE seguía en Cobros.
 */
export function planSinConsentimiento(motivo: MotivoSinConsentimiento): Plan {
  return {
    escritura: { estado: 'OMITIDA_SIN_CONSENTIMIENTO', desde: ['PENDIENTE_APROBACION'], soltarRecibo: true },
    desenlace: { tipo: 'SIN_CONSENTIMIENTO', http: 409, mensaje: mensajeSinConsentimiento(motivo), notificar: false },
  };
}

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
// cobra los recibos PENDIENTE con `proximo_reintento` vencido. Por eso el recibo
// nace SIEMPRE sin `proximo_reintento` y solo se arma cuando cobrar ya está
// decidido: modo automático y la penalización ya en RECIBO_CREADO. Antes nacía
// armado en automático: si el trigger la revertía entre el SELECT y el UPDATE, el
// CAS no tocaba nada y el cron salía… y el dunning cobraba igual una penalización
// revertida, sin rastro en su registro. Como segunda cerradura, el dunning ya no
// cobra el recibo de una penalización sin cobro decidido
// (`dunningPuedeCobrarPenalizacion`, más abajo).
//
// Sin migración: el trigger de no-show solo revierte desde DETECTADA o
// PENDIENTE_APROBACION, y nunca toca recibos.
// - Revertida desde PENDIENTE_APROBACION: su recibo se quedaba PENDIENTE en
//   Cobros, y el mostrador o «Marcar cobrado» lo cobraban. Ahora lo suelta y lo
//   borra el barrido horario del cron (`soltarReciboDePenalizacionAnulada`, más
//   abajo), y mientras tanto esos dos caminos no lo cobran
//   (`cobroManualDeRecibo` con `'mostrador'`).
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
export type AlertaCron = 'NO_SE_PUDO_ARMAR' | 'RECIBO_NO_PENDIENTE_AL_ARMAR' | 'NO_SE_PUDO_DEVOLVER' | 'NO_SE_PUDO_DESARMAR';

/**
 * ¿Ha quedado el recibo fuera del dunning? El UPDATE solo toca un recibo
 * PENDIENTE, así que una fila tocada basta. Con error, o sin filas, se relee: el
 * dunning solo cobra recibos PENDIENTE con `proximo_reintento`, y cualquier otra
 * cosa (otro estado, sin programar, borrado) también vale. Sin poder releer, no
 * está confirmado.
 *
 * Importa porque lo que viene detrás es devolver la penalización a DETECTADA, y
 * una DETECTADA la puede revertir el trigger de no-show: si su recibo siguiera
 * armado, el dunning cobraría una penalización revertida.
 */
export function reciboQuedaDesarmado(desarme: { error: boolean; tocadas: number }, lectura?: LecturaArmado): boolean {
  if (!desarme.error && desarme.tocadas > 0) return true;
  return lectura?.ok === true && (lectura.estado !== 'PENDIENTE' || !lectura.armado);
}

/**
 * Quién retoma el cobro si este intento no deja nada escrito (transitorio, Stripe
 * no listo, recibo ilegible):
 * - DUNNING: el recibo está PENDIENTE y armado; lo reintenta el dunning.
 * - NINGUNO: el recibo ya no es cobrable; el guardia no cobra y la relectura
 *   decide.
 */
export type Reintento = 'DUNNING' | 'NINGUNO';

export type TrasArmar =
  | { accion: 'COBRAR'; alerta: AlertaCron | null; reintento: Reintento }
  | { accion: 'CERRAR_FALLIDA'; alerta: null }
  | { accion: 'DEVOLVER_A_DETECTADA'; alerta: AlertaCron };

/** Vuelta atrás cuando no se pudo armar: la próxima pasada del cron la recoge entera. */
export const VUELTA_A_DETECTADA: Escritura = { estado: 'DETECTADA', desde: ['RECIBO_CREADO'] };

/** La penalización recién enlazada a un recibo que ya estaba FALLIDO: se cierra sin cobrar. */
export const CIERRE_RECIBO_FALLIDO: Escritura = { estado: 'FALLIDA', desde: ['RECIBO_CREADO'] };

/**
 * Armar el recibo no confirmó una fila: ¿se cobra igual? Solo si no puede quedar
 * nada que nadie reintente.
 * - Armado (una fila), o ya lo estaba (código anterior) → cobrar: si el cobro
 *   sale transitorio, lo retoma el dunning.
 * - FALLIDO (el dunning lo agotó) → NO se cobra: la penalización queda FALLIDA,
 *   lo mismo que escribe `seguirAlRecibo` con ese recibo. Antes se devolvía a
 *   DETECTADA y, como armar exige PENDIENTE, cada pasada repetía lo mismo con su
 *   alerta, para siempre. Cobrarlo aquí no es seguro: tras agotar los reintentos
 *   la clave (`-i<intentos>`) es nueva, así que es un cargo nuevo mientras la
 *   socia puede estar pagando ese mismo recibo desde el portal (un FALLIDO es
 *   deuda cobrable); y un transitorio obligaría a volver a DETECTADA con el
 *   desenlace del cargo sin saber, donde el trigger la podría revertir con el
 *   dinero dentro. «Cobrar online» en Cobros tampoco la cobra
 *   (`cobroManualDeRecibo`: solo RECIBO_CREADO). Si la socia lo paga por otro
 *   camino, el barrido la pasa a COBRADA.
 * - El recibo ya no es cobrable (cobrado o anulado a mano, borrado) → se intenta
 *   igual: el guardia del recibo no cobra, y la relectura deja la penalización
 *   COBRADA o FALLIDA. Con alerta, porque no debería pasar.
 * - Error, no se pudo leer, o sigue PENDIENTE sin armar → NO se cobra. Un
 *   transitorio dejaría RECIBO_CREADO con el recibo sin armar, y eso no lo
 *   reintenta nadie: el cron solo lee DETECTADA y el dunning solo cobra recibos
 *   armados. Se desarma, se devuelve a DETECTADA y la próxima pasada lo repite
 *   entero (23505 → enlazar → armar → cobrar), con la misma Idempotency-Key.
 */
export function decidirTrasArmar(armado: { error: boolean; tocadas: number }, lectura?: LecturaArmado): TrasArmar {
  if (!armado.error && armado.tocadas > 0) return { accion: 'COBRAR', alerta: null, reintento: 'DUNNING' };
  if (lectura?.ok) {
    if (lectura.estado === 'PENDIENTE' && lectura.armado) return { accion: 'COBRAR', alerta: null, reintento: 'DUNNING' };
    if (lectura.estado === 'FALLIDO') return { accion: 'CERRAR_FALLIDA', alerta: null };
    if (lectura.estado !== 'PENDIENTE') return { accion: 'COBRAR', alerta: 'RECIBO_NO_PENDIENTE_AL_ARMAR', reintento: 'NINGUNO' };
  }
  return { accion: 'DEVOLVER_A_DETECTADA', alerta: 'NO_SE_PUDO_ARMAR' };
}

/**
 * Tras el cobro automático: las MISMAS reglas que la aprobación a mano, saliendo
 * de RECIBO_CREADO, con dos diferencias.
 * - Transitorio, Stripe no listo o recibo ilegible → no se escribe. Sigue
 *   RECIBO_CREADO con el recibo armado y lo reintenta el DUNNING (el cron solo lee
 *   DETECTADA), con la misma Idempotency-Key porque el contador de intentos no se
 *   movió.
 * - Recibo COBRADO → COBRADA y aviso (deduplicado).
 * - ⚠️ Rechazo real (FALLO_COBRO) o sin tarjeta, con el recibo PENDIENTE y armado
 *   → NO se escribe: los reintentos son del dunning, y su recibo sigue en el
 *   ciclo. Escribir FALLIDA aquí dejaba la penalización «fallida» mientras el
 *   dunning seguía cobrando, y si cobraba, fallida con el dinero dentro. Sin
 *   tarjeta, el dunning la omite sin contar intento y cobra cuando la haya. El
 *   desenlace lo escribe `seguirAlRecibo` cuando el dunning cobra o agota el recibo.
 *   Este rechazo no pasa por `registrarFalloCobro`: el primer barrido del dunning
 *   repite la misma clave y Stripe le devuelve el mismo rechazo, que ahí sí cuenta
 *   como intento. Vale mientras el cron corra antes de que caduque la clave
 *   (~24 h): corre cada hora y el dunning una vez al día.
 * - ⚠️ Adeudo SEPA en `processing` → NO se escribe COBRADA: el adeudo puede fallar
 *   y `registrarFalloCobro` devuelve el recibo al dunning. Se queda RECIBO_CREADO
 *   y la cierra `seguirAlRecibo` cuando el recibo quede COBRADO (lo mismo que
 *   cuando ese `processing` sale del dunning). La aprobación a mano sigue dando
 *   por cobrado su `processing`.
 * - Recibo FALLIDO (el dunning lo agotó entre medias), NO_ENCONTRADO o anulado
 *   → FALLIDA. El cron saca antes el recibo del dunning (`crearReciboYCobrar`).
 */
export function planificarCobroAutomatico(cobro: Cobro, recibo: LecturaRecibo | undefined, reintento: Reintento): Plan {
  if (cobro.ok && !cobro.aviso && cobro.status === 'processing') return { escritura: null, desenlace: desenlaces.adeudoEnCurso() };
  const plan = planificarTrasCobro(cobro, recibo, 'RECIBO_CREADO');
  const sigueEnElDunning = reintento === 'DUNNING' && (cobro.errorCode === 'FALLO_COBRO' || cobro.errorCode === 'SIN_TARJETA')
    && plan.escritura?.estado === 'FALLIDA' && recibo?.ok === true && recibo.estado === 'PENDIENTE';
  return sigueEnElDunning ? { escritura: null, desenlace: plan.desenlace } : plan;
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
  /** `proximo_reintento = null`, solo si sigue PENDIENTE. Devuelve las filas tocadas. */
  desarmarRecibo(): Promise<{ error: boolean; tocadas: number }>;
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
  /** El recibo ya estaba FALLIDO: FALLIDA sin cobrar. Sin `cerrada`, la cierra el barrido. */
  | { paso: 'RECIBO_FALLIDO'; cerrada: boolean }
  | { paso: 'COBRO'; desenlace: Desenlace };

/** Crear el recibo de una penalización DETECTADA y, en automático, cobrarlo. */
export async function crearReciboYCobrar(io: IoCronPenalizacion, p: { reciboId: string; automatico: boolean }): Promise<PasadaCron> {
  // Desarmar SIN comprobarlo no vale: un error de la BD se tragaba y lo de detrás
  // (devolver a DETECTADA, dejar la penalización a merced del trigger) seguía
  // como si el recibo estuviera fuera del dunning. Si no se confirma, se avisa,
  // y quien llama no devuelve nada a DETECTADA.
  const desarmar = async (): Promise<boolean> => {
    const desarme = await io.desarmarRecibo();
    const confirmado = !desarme.error && desarme.tocadas > 0;
    const ok = reciboQuedaDesarmado(desarme, confirmado ? undefined : await io.leerArmadoRecibo());
    if (!ok) io.alertar('NO_SE_PUDO_DESARMAR');
    return ok;
  };

  const origen = origenDelRecibo(await io.insertarRecibo());
  if (origen === 'ERROR') return { paso: 'ERROR_RECIBO' };

  const enlace = await io.enlazarRecibo(escrituraAlCrearRecibo(p.automatico));
  // Error en el UPDATE: se sale sin cobrar. El recibo queda sin armar, así que
  // nada lo cobra; el próximo barrido reinserta (23505) y repite el UPDATE.
  if (enlace.error) return { paso: 'ERROR_ENLACE' };
  if (enlace.tocadas === 0) {
    const limpieza = limpiezaTrasCasFallido({ origen, reciboId: p.reciboId, puntero: await io.leerPunteroRecibo() });
    if (limpieza === 'BORRAR') await io.borrarRecibo();
    // Sin confirmar, queda la alerta; el dunning tampoco lo cobra, porque no cobra
    // el recibo de una penalización sin cobro decidido (`dunningPuedeCobrarPenalizacion`).
    if (limpieza === 'DESARMAR') await desarmar();
    return { paso: 'YA_NO_DETECTADA', limpieza };
  }
  if (!reciboEntraEnDunning({ automatico: p.automatico, casAplicado: true })) {
    // Manual: el recibo no puede quedar cobrable por el dunning. Uno nuevo nace
    // sin armar; uno que ya existía pudo armarlo el código anterior (o el
    // estudio pasó de automático a manual entre pasadas), así que se desarma.
    // Sin confirmar: alerta, y el dunning no cobra una PENDIENTE_APROBACION.
    if (origen === 'YA_EXISTIA') await desarmar();
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
    // cobrable con la penalización en DETECTADA), luego devolver. Si no se puede
    // confirmar que quedó desarmado, NO se devuelve: una RECIBO_CREADO no la
    // revierte el trigger, y si el recibo sigue armado lo cobra el dunning con el
    // cobro ya decidido; si no, lo cuenta la salud `penalizaciones-recibo-sin-programar`.
    if (!(await desarmar())) return { paso: 'SIN_ARMAR', devuelta: false };
    const vuelta = await io.devolverPenalizacion(VUELTA_A_DETECTADA);
    const devuelta = !vuelta.error && vuelta.tocadas > 0;
    if (!devuelta) io.alertar('NO_SE_PUDO_DEVOLVER');
    return { paso: 'SIN_ARMAR', devuelta };
  }

  if (tras.accion === 'CERRAR_FALLIDA') {
    const cierre = await io.cerrarPenalizacion(CIERRE_RECIBO_FALLIDO);
    return { paso: 'RECIBO_FALLIDO', cerrada: !cierre.error && cierre.tocadas > 0 };
  }

  const cobro = await io.cobrar();
  const recibo = hayQueReleerRecibo(cobro) ? await io.leerRecibo() : undefined;
  const plan = planificarCobroAutomatico(cobro, recibo, tras.reintento);
  // Toda FALLIDA que escribe el cron saca antes su recibo del dunning, y el dunning
  // no cobra el recibo de una FALLIDA. Importa sobre todo con un cobro que entró
  // sin quedar registrado (COBRADO_SIN_PERSISTIR): el recibo sigue PENDIENTE y,
  // pasadas ~24 h, reintentarlo ya no repite la clave. Lo arregla el webhook, y
  // el barrido la pasa a COBRADA.
  if (plan.escritura?.estado === 'FALLIDA' && tras.reintento === 'DUNNING') await desarmar();
  let desenlace = plan.desenlace;
  if (plan.escritura) {
    const cierre = await io.cerrarPenalizacion(plan.escritura);
    if (cierre.error || cierre.tocadas === 0) desenlace = resolverEscrituraSinEfecto(plan, await io.leerEstadoPenalizacion());
  }
  if (desenlace.notificar) await io.notificarPago();
  return { paso: 'COBRO', desenlace };
}

// ── El dunning y el barrido: la penalización sigue a su recibo ──────────────
//
// En automático, el cobro de una penalización puede acabar fuera del cron: lo
// reintenta el dunning (lib/inngest/dunning.ts), lo reconcilia el webhook de un
// cargo con tarjeta cuya respuesta se perdió, o alguien lo cobra desde Cobros.
// Ninguno de esos caminos sabe nada de penalizaciones, y la penalización se
// quedaba RECIBO_CREADO (o FALLIDA) con el dinero dentro.
//
// No se copia la confirmación del cobro en ellos: el dueño de «recibo cobrado» es
// quien es (`confirmar-cobro.ts`/`dunning-server.ts`, y lo que salga de #1987). Lo
// que se añade es un solo dueño de «la penalización refleja su recibo»: lee el
// ESTADO del recibo, no el resultado de quien cobró, así que da igual qué camino
// lo cobró y se puede llamar las veces que haga falta. Lo llaman el dunning al
// terminar con el recibo y el cron cada hora sobre lo que aún no cuadra.

export const PREFIJO_RECIBO_PENALIZACION = 'rec-penaliz-';

/** Id de la penalización de un recibo `rec-penaliz-<id>`; `null` si el recibo no es de una. */
export function penalizacionDelRecibo(reciboId: string): string | null {
  if (!reciboId.startsWith(PREFIJO_RECIBO_PENALIZACION)) return null;
  return reciboId.slice(PREFIJO_RECIBO_PENALIZACION.length) || null;
}

/** Lectura de `penalizaciones.estado`. `estado: null` = no existe o no apunta a ese recibo. */
export type LecturaPenalizacion = { ok: true; estado: string | null } | { ok: false };

/**
 * Estados con los que el dunning puede cobrar el recibo.
 * - RECIBO_CREADO: el camino normal en automático, cobro decidido.
 * - COBRADA: con su recibo PENDIENTE y programado solo existe si un adeudo SEPA
 *   que salió en `processing` (dado por cobrado en la aprobación a mano) falló
 *   después y `registrarFalloCobro` devolvió el recibo al dunning. Ya no debería
 *   durar: `registrarFalloCobro` la pasa a RECIBO_CREADO en ese momento
 *   (`escrituraPorEstadoDelRecibo`). Se queda en la lista por si esa escritura no
 *   llegó y aún no ha pasado el barrido: dejarla fuera era no perseguir la deuda.
 */
export const ESTADOS_QUE_DEJAN_COBRAR_AL_DUNNING: readonly EstadoPenalizacion[] = ['RECIBO_CREADO', 'COBRADA'];

/**
 * ¿Puede el dunning cobrar el recibo de esta penalización? El dunning cobra
 * cualquier recibo PENDIENTE armado, y un recibo de penalización puede quedar
 * armado sin que la penalización lo esté (el código anterior, un desarme que no
 * se pudo confirmar). Fuera, entre otras:
 * - DETECTADA y PENDIENTE_APROBACION: las puede revertir el trigger de no-show, y
 *   la segunda espera a que el estudio la apruebe.
 * - FALLIDA: el cron saca del dunning el recibo de toda FALLIDA que escribe; si
 *   sigue armado es un cobro que entró sin quedar registrado.
 * - OMITIDA_* y REEMBOLSADA: se decidió no cobrar, o el dinero ya volvió.
 * Sin poder leerla, tampoco: se omite sin contar intento y se repite mañana.
 */
export function dunningPuedeCobrarPenalizacion(lectura: LecturaPenalizacion): boolean {
  return lectura.ok && ESTADOS_QUE_DEJAN_COBRAR_AL_DUNNING.includes(lectura.estado as EstadoPenalizacion);
}

// ── Cobrar a mano un recibo de penalización (Cobros, Automatizaciones) ──────
//
// «Cobrar online» (/api/cobros/cobrar-online) y la aprobación desde
// Automatizaciones (/api/stripe/charge-off-session) cobran cualquier recibo
// PENDIENTE o FALLIDO. El de una penalización PENDIENTE_APROBACION se cobraba así
// sin pasar por la aprobación ni por el guardia de consentimiento, y el de una
// OMITIDA_* (se decidió no cobrar) también.

/**
 * Con qué estado de la penalización se puede cobrar su recibo desde esas pantallas
 * (y desde el ejecutor del Decision OS, que cobra lo que se aprobó en «Se quedaron N
 * pagos sin completar»): el cobro ya decidido.
 */
export const ESTADOS_QUE_DEJAN_COBRAR_A_MANO: readonly EstadoPenalizacion[] = ['RECIBO_CREADO'];

/**
 * Con qué estado puede la alumna PAGAR el recibo de su penalización en el checkout
 * (/api/stripe/checkout). Además del cobro decidido, la FALLIDA: nadie la vuelve a
 * cobrar sola (el dunning agotó el recibo, o se cerró sin cobrar) y sigue siendo una
 * deuda suya que tiene que poder pagar. La paga ella, en ese momento; cuando el
 * recibo queda COBRADO, el barrido del cron la pasa a COBRADA.
 * Fuera DETECTADA y PENDIENTE_APROBACION (el estudio no la ha aprobado ni se ha
 * comprobado su contrato), las OMITIDA_* (se decidió no cobrar), COBRADA y REEMBOLSADA.
 */
export const ESTADOS_QUE_DEJAN_PAGAR_A_LA_ALUMNA: readonly EstadoPenalizacion[] = ['RECIBO_CREADO', 'FALLIDA'];

/**
 * Quién cobra: el estudio con la tarjeta guardada (Cobros, Automatizaciones,
 * Decision OS), la alumna pagando en el checkout, o el personal en el mostrador
 * (datáfono/Bizum del TPV y «Marcar cobrado», también en lote).
 */
export type ContextoCobroManual = 'panel' | 'checkout_alumna' | 'mostrador';

/**
 * `sinComprobar`: solo en el mostrador, cuando no se pudo leer la penalización y
 * se deja cobrar igual. Quien llama lo registra en Sentry.
 */
export type VeredictoCobroManual = { ok: true; sinComprobar?: true } | { ok: false; http: 409 | 503; mensaje: string };

/** Las OMITIDA_*: se decidió no cobrar. */
export const ESTADOS_OMITIDA: readonly EstadoPenalizacion[] =
  ['OMITIDA_SIN_TARJETA', 'OMITIDA_SIN_CONSENTIMIENTO', 'OMITIDA_COMPENSADA', 'OMITIDA_REVERTIDA', 'OMITIDA_SIN_CUOTA'];

/**
 * Plaza fija sin cuota (política del estudio, migr 20260915215236): con LIBERAR o
 * MANTENER_SIN_PENALIZAR, una clase que su plaza fija le había reservado
 * (`res-pf-*`) no se cobra si ya no tiene cuota que la cubra. Con MANTENER, las
 * reglas de siempre. `cubre` sale de `cuota_cubre_plaza_fija(…, false)`: la misma
 * regla que usa el motor, con la gracia de la renovación por cobrar.
 */
export function omitirPorPlazaFijaSinCuota(p: { politica: string | null | undefined; reservaId: string; cubre: boolean }): boolean {
  const politicaNoCobra = p.politica === 'LIBERAR' || p.politica === 'MANTENER_SIN_PENALIZAR';
  return politicaNoCobra && p.reservaId.startsWith('res-pf-') && !p.cubre;
}

/**
 * Con qué estados NO se cobra en el mostrador: la penalización está anulada (se
 * decidió no cobrarla) o el dinero ya volvió. El resto sí: PENDIENTE_APROBACION,
 * RECIBO_CREADO, FALLIDA… hay una persona delante cobrando a la alumna, que es
 * una forma de aprobarla.
 */
export const ESTADOS_ANULADOS_PARA_EL_MOSTRADOR: readonly EstadoPenalizacion[] = [...ESTADOS_OMITIDA, 'REEMBOLSADA'];

export const TEXTO_PENALIZACION_ANULADA = 'Esta penalización está anulada: no se cobra.';

// A la alumna no se le cuentan los estados internos de la penalización.
const ALUMNA_SIN_COMPROBAR = 'No hemos podido comprobar este cargo y no se te ha cobrado nada. Inténtalo de nuevo en un momento.';
const ALUMNA_AUN_NO = 'Este cargo todavía no se puede pagar: tu estudio aún no lo ha confirmado.';
const ALUMNA_NO_PENDIENTE = 'Este cargo ya no está pendiente de pago. Si tienes dudas, habla con tu estudio.';

const NO_DESDE_AQUI = 'Esta penalización no se puede cobrar desde aquí:';

const POR_QUE_NO_A_MANO: Partial<Record<EstadoPenalizacion, string>> = {
  DETECTADA: 'todavía se está comprobando si se puede cobrar.',
  PENDIENTE_APROBACION: 'está esperando a que la apruebes en Resumen, en «penalizaciones pendientes de aprobar», que comprueba antes si el contrato de la alumna recoge el cargo.',
  OMITIDA_SIN_TARJETA: 'se dejó sin cobrar porque la alumna no tenía un método de pago guardado.',
  OMITIDA_SIN_CONSENTIMIENTO: 'se dejó sin cobrar porque el contrato que aceptó la alumna no recoge este cargo.',
  OMITIDA_COMPENSADA: 'se dejó sin cobrar porque esa reserva ya dio una recuperación a la alumna.',
  OMITIDA_REVERTIDA: 'se anuló al corregir la asistencia.',
  OMITIDA_SIN_CUOTA: 'se dejó sin cobrar porque era una clase de su plaza fija y ya no tenía cuota, como elegiste en Configuración.',
  COBRADA: 'ya consta como cobrada.',
  // No se vuelve a cobrar con la tarjeta: tras agotar los reintentos sería un cargo
  // nuevo mientras la alumna puede estar pagándola. Marcar el recibo cobrado sí es
  // un camino real (Cobros → «Marcar cobrado»), y el barrido del cron pasa entonces
  // la penalización a COBRADA. ⚠️ No decir «que la pague desde su app»: el checkout
  // la acepta, pero la app de la alumna no tiene hoy ningún botón para pagar un recibo.
  FALLIDA: 'quedó como no cobrada y no se vuelve a cobrar con su tarjeta. Si la alumna te la paga, marca su recibo como cobrado en Cobros y la penalización se pondrá al día sola.',
  REEMBOLSADA: 'se devolvió a la alumna.',
};

/**
 * ¿Se puede cobrar este recibo desde Cobros o Automatizaciones? Un recibo que no
 * es de una penalización, siempre (sin leer nada). El de una penalización, solo
 * con ella en RECIBO_CREADO; sin poder leerla, no (503, se puede reintentar).
 * Una penalización que no apunta a este recibo (`estado: null`) tampoco.
 *
 * `checkout_alumna`: la alumna paga en el checkout. Deja además la FALLIDA
 * (`ESTADOS_QUE_DEJAN_PAGAR_A_LA_ALUMNA`) y contesta con textos para ella.
 *
 * `mostrador`: solo se bloquea una penalización anulada
 * (`ESTADOS_ANULADOS_PARA_EL_MOSTRADOR`). Aquí la lectura es la penalización POR
 * SU ID, apunte o no a este recibo: el barrido suelta `recibo_id` antes de borrar
 * el recibo, y si el borrado no llega el recibo sigue ahí. `estado: null` (no
 * existe) deja cobrar.
 * ⚠️ Sin poder leerla, también deja cobrar (`sinComprobar`), a diferencia de los
 * otros dos contextos: el mostrador no cobra solo, hay una persona delante con la
 * alumna pagando, y bloquearlo por un fallo de lectura deja sin cobrar cuotas
 * reales por algo que casi nunca es una penalización anulada. Quien llama lo
 * registra en Sentry.
 */
export function cobroManualDeRecibo(
  reciboId: string, lectura?: LecturaPenalizacion, contexto: ContextoCobroManual = 'panel',
): VeredictoCobroManual {
  // Por el prefijo y no por `penalizacionDelRecibo`: un `rec-penaliz-` sin id no
  // puede colarse como recibo normal (su lectura sale `estado: null` y no se cobra).
  if (!reciboId.startsWith(PREFIJO_RECIBO_PENALIZACION)) return { ok: true };
  if (contexto === 'mostrador') {
    if (!lectura || !lectura.ok) return { ok: true, sinComprobar: true };
    return ESTADOS_ANULADOS_PARA_EL_MOSTRADOR.includes(lectura.estado as EstadoPenalizacion)
      ? { ok: false, http: 409, mensaje: TEXTO_PENALIZACION_ANULADA }
      : { ok: true };
  }
  const alumna = contexto === 'checkout_alumna';
  if (!lectura || !lectura.ok) {
    return {
      ok: false, http: 503,
      mensaje: alumna ? ALUMNA_SIN_COMPROBAR : `${NO_DESDE_AQUI} no hemos podido comprobar en qué estado está. No se ha cobrado; inténtalo de nuevo en un momento.`,
    };
  }
  const estado = lectura.estado as EstadoPenalizacion;
  if (alumna) {
    if (ESTADOS_QUE_DEJAN_PAGAR_A_LA_ALUMNA.includes(estado)) return { ok: true };
    const aunNo = estado === 'DETECTADA' || estado === 'PENDIENTE_APROBACION';
    return { ok: false, http: 409, mensaje: aunNo ? ALUMNA_AUN_NO : ALUMNA_NO_PENDIENTE };
  }
  if (ESTADOS_QUE_DEJAN_COBRAR_A_MANO.includes(estado)) return { ok: true };
  const porQue = POR_QUE_NO_A_MANO[lectura.estado as EstadoPenalizacion] ?? 'no tiene un cobro decidido.';
  return { ok: false, http: 409, mensaje: `${NO_DESDE_AQUI} ${porQue}` };
}

// ── Remesa de domiciliaciones (Cobros → «Preparar recibos para el banco») ──
//
// La remesa metía todo recibo PENDIENTE con mandato, también los `rec-penaliz-*`:
// uno sin aprobar (PENDIENTE_APROBACION) se cargaba en la cuenta de la alumna sin
// pasar por la aprobación ni por el guardia de consentimiento, y uno anulado
// (OMITIDA_*) también. Es un cobro desde el panel como «Cobrar online», así que
// con la misma regla: solo con la penalización en RECIBO_CREADO.

/**
 * Estado de la penalización de cada recibo `rec-penaliz-*`, por id del recibo (solo
 * si la penalización apunta a ESE recibo). `ok: false` = no se pudo leer.
 */
export type LecturaPenalizacionesDeRecibos =
  | { ok: true; estadoPorRecibo: ReadonlyMap<string, string> }
  | { ok: false };

export interface RemesaSinPenalizaciones<R> {
  entran: R[];
  /** Recibos de penalización sin el cobro decidido (sin aprobar, anulada, ya cobrada…). */
  fueraSinAprobar: number;
  /** Recibos de penalización que no se pudieron comprobar: fuera, por si acaso. */
  fueraSinComprobar: number;
}

/**
 * Qué recibos entran en la remesa. Un recibo que no es de una penalización, siempre.
 * El de una penalización, con `cobroManualDeRecibo` en `'panel'`; sin poder leerla,
 * fuera (un adeudo en el banco no se deshace con un clic).
 */
export function recibosParaRemesa<R extends { id: string }>(
  recibos: readonly R[], lectura: LecturaPenalizacionesDeRecibos,
): RemesaSinPenalizaciones<R> {
  const out: RemesaSinPenalizaciones<R> = { entran: [], fueraSinAprobar: 0, fueraSinComprobar: 0 };
  for (const r of recibos) {
    if (cobroManualDeRecibo(r.id).ok) { out.entran.push(r); continue; }
    if (!lectura.ok) { out.fueraSinComprobar++; continue; }
    const veredicto = cobroManualDeRecibo(r.id, { ok: true, estado: lectura.estadoPorRecibo.get(r.id) ?? null }, 'panel');
    if (veredicto.ok) out.entran.push(r);
    else out.fueraSinAprobar++;
  }
  return out;
}

/** Lo que dice la pantalla de los recibos de penalización que se quedaron fuera. `null` si ninguno. */
export function avisoPenalizacionesFueraDeRemesa(f: { fueraSinAprobar: number; fueraSinComprobar: number }): string | null {
  const partes: string[] = [];
  const recibos = (n: number) => (n === 1 ? '1 recibo de penalización' : `${n} recibos de penalización`);
  if (f.fueraSinAprobar > 0) {
    partes.push(`${recibos(f.fueraSinAprobar)} no ${f.fueraSinAprobar === 1 ? 'entra' : 'entran'}: su cobro no está aprobado (o se anuló).`);
  }
  if (f.fueraSinComprobar > 0) {
    partes.push(`${recibos(f.fueraSinComprobar)} no ${f.fueraSinComprobar === 1 ? 'entra' : 'entran'}: no hemos podido comprobar si se puede cobrar. Vuelve a prepararlo en un momento.`);
  }
  return partes.length > 0 ? partes.join(' ') : null;
}

/**
 * Estado del recibo → escritura de la penalización.
 * - COBRADO → COBRADA, desde lo mismo que corrige cualquier cobro confirmado.
 * - FALLIDO → FALLIDA, desde RECIBO_CREADO (el dunning lo agotó) y desde COBRADA
 *   (un adeudo SEPA dado por cobrado en `processing` que no llegó a entrar: con
 *   tarjeta un recibo COBRADO nunca pasa a FALLIDO, `registrarFalloCobro` lo
 *   excluye). Una PENDIENTE_APROBACION con el recibo fallido es cosa del estudio,
 *   y una DETECTADA la cierra el cron.
 * - ⚠️ PENDIENTE → RECIBO_CREADO, solo desde COBRADA. Es el adeudo SEPA que falló
 *   y `registrarFalloCobro` devolvió al dunning: el cobro sigue decidido y el
 *   dunning lo persigue, pero el dinero NO está, y la liquidación de la
 *   instructora imputa toda COBRADA. Ni FALLIDA ni REEMBOLSADA: las dos sacan el
 *   recibo del dunning (`dunningPuedeCobrarPenalizacion`) y la deuda se
 *   abandonaría. Dejarla COBRADA durante los reintentos tampoco: cada adeudo
 *   tarda días en resolverse y la espera cruza liquidaciones.
 * - ⚠️ DEVUELTO → FALLIDA, desde COBRADA y desde RECIBO_CREADO (un recibo marcado
 *   devuelto antes de cobrarse ya no lo cobra el dunning, y RECIBO_CREADO diría
 *   para siempre que se está cobrando). Un DEVUELTO sigue siendo deuda (el
 *   panel lo deja cobrar otra vez), así que no REEMBOLSADA: si luego se cobra, el
 *   barrido la vuelve a COBRADA con el mes en que entró de verdad. Reembolso y
 *   disputa perdida escriben antes REEMBOLSADA (`marcarPenalizacionReembolsada`),
 *   y esto es la red cuando esa escritura no llega, o cuando alguien cambió el
 *   recibo a mano.
 * EN_CURSO no resuelve: remesas y reintentos manuales lo escriben sin pasar por
 * Stripe, así que no prueba nada. Se espera a COBRADO.
 */
export function escrituraPorEstadoDelRecibo(estadoRecibo: string | null): Escritura | null {
  if (estadoRecibo === 'COBRADO') return { estado: 'COBRADA', desde: ESTADOS_QUE_CORRIGE_UN_COBRO };
  if (estadoRecibo === 'FALLIDO') return { estado: 'FALLIDA', desde: ['RECIBO_CREADO', 'COBRADA'] };
  if (estadoRecibo === 'PENDIENTE') return { estado: 'RECIBO_CREADO', desde: ['COBRADA'] };
  if (estadoRecibo === 'DEVUELTO') return { estado: 'FALLIDA', desde: ['COBRADA', 'RECIBO_CREADO'] };
  return null;
}

/** Motivo de revisión de la liquidación cuando una COBRADA deja de serlo por su recibo. */
export function motivoRevisionPorRecibo(estadoRecibo: string | null, importe: number): string {
  const eur = `${importe.toFixed(2)}€`;
  if (estadoRecibo === 'PENDIENTE') return `Una penalización de ${eur} ya repartida aquí no ha entrado todavía: su recibo vuelve a estar pendiente de cobro.`;
  if (estadoRecibo === 'DEVUELTO') return `Una penalización de ${eur} ya repartida aquí se ha marcado como devuelta.`;
  return `Una penalización de ${eur} ya repartida aquí no se llegó a cobrar: el adeudo falló.`;
}

/**
 * Una COBRADA que deja de serlo pudo repartirse ya en la liquidación de una
 * instructora: hay que pedir que se revise, igual que al reembolsarla.
 */
export function hayQueRevisarLiquidacion(estadoPrevio: string | null, escritura: Escritura): boolean {
  return estadoPrevio === 'COBRADA' && escritura.estado !== 'COBRADA';
}

/**
 * Lo que barre el cron cada hora: penalizaciones cuyo recibo ya se resolvió por
 * otro camino. DETECTADA queda fuera: la procesa el propio cron en la misma
 * pasada. Cada entrada tiene que poder escribirse con `escrituraPorEstadoDelRecibo`;
 * si no, el barrido la volvería a encontrar cada hora (hay test).
 */
export const BARRIDO_RECIBO_RESUELTO: ReadonlyArray<{ estadoRecibo: 'COBRADO' | 'FALLIDO' | 'PENDIENTE' | 'DEVUELTO'; estados: readonly EstadoPenalizacion[] }> = [
  { estadoRecibo: 'COBRADO', estados: ['PENDIENTE_APROBACION', 'RECIBO_CREADO', 'FALLIDA'] },
  { estadoRecibo: 'FALLIDO', estados: ['RECIBO_CREADO', 'COBRADA'] },
  // Una COBRADA sin el dinero: adeudo devuelto al dunning, o recibo marcado
  // devuelto (a mano o por un reembolso cuya llamada a la nómina no llegó).
  { estadoRecibo: 'PENDIENTE', estados: ['COBRADA'] },
  { estadoRecibo: 'DEVUELTO', estados: ['COBRADA', 'RECIBO_CREADO'] },
];

/** Acceso a datos de `seguirAlRecibo`, inyectado para probarlo sin Supabase. */
export interface IoPenalizacionSigueAlRecibo {
  leerRecibo(): Promise<LecturaRecibo>;
  /** CAS de la penalización a `e.estado`, con `procesada_en`. `estadoRecibo`: el leído, para el motivo de revisión. */
  cerrarPenalizacion(e: Escritura, estadoRecibo: string | null): Promise<{ error: boolean; tocadas: number }>;
  leerEstadoPenalizacion(): Promise<string | null>;
  /** PAGO_PENALIZACION, deduplicado por `pago-penalizacion:<id>`. */
  notificarPago(): Promise<void>;
}

export type Seguimiento =
  | { paso: 'RECIBO_ILEGIBLE' }
  | { paso: 'RECIBO_SIN_RESOLVER' }
  | { paso: 'ESCRITA'; estado: EstadoPenalizacion; notificada: boolean }
  | { paso: 'SIN_EFECTO'; estado: string | null; notificada: boolean };

/**
 * Deja la penalización como dice su recibo. Compare-and-set, e idempotente: una
 * segunda llamada no toca nada. El aviso sale si la penalización ha quedado
 * COBRADA con su recibo COBRADO, la haya escrito esta llamada u otra (un reintento
 * del step que murió entre escribir y avisar): lo deduplica la clave del motor.
 */
export async function seguirAlRecibo(io: IoPenalizacionSigueAlRecibo): Promise<Seguimiento> {
  const recibo = await io.leerRecibo();
  if (!recibo.ok) return { paso: 'RECIBO_ILEGIBLE' };
  const escritura = escrituraPorEstadoDelRecibo(recibo.estado);
  if (!escritura) return { paso: 'RECIBO_SIN_RESOLVER' };
  const cierre = await io.cerrarPenalizacion(escritura, recibo.estado);
  const aplicada = !cierre.error && cierre.tocadas > 0;
  const estado = aplicada ? escritura.estado : await io.leerEstadoPenalizacion();
  const notificada = escritura.estado === 'COBRADA' && estado === 'COBRADA';
  if (notificada) await io.notificarPago();
  return aplicada ? { paso: 'ESCRITA', estado: escritura.estado, notificada } : { paso: 'SIN_EFECTO', estado, notificada };
}

// ── El barrido: el recibo de una penalización anulada se suelta ─────────────
//
// En manual el recibo nace con la penalización en PENDIENTE_APROBACION. Si luego
// se corrige el no-show, el trigger la pasa a OMITIDA_REVERTIDA y no toca el
// recibo: quedaba PENDIENTE en Cobros, y el mostrador o «Marcar cobrado» lo
// cobraban. Ese dinero entraba de una penalización anulada, fuera de la
// liquidación, y ningún barrido lo miraba (las OMITIDA_* no están en
// `BARRIDO_RECIBO_RESUELTO`). Lo mismo con OMITIDA_SIN_TARJETA u
// OMITIDA_COMPENSADA de una DETECTADA que ya tenía recibo de una pasada anterior.
//
// Sin tocar el trigger: el cron pasa cada hora, y mientras tanto el mostrador no
// cobra una penalización anulada.

/** Lo que se lee del recibo en el barrido. */
export interface ReciboDePenalizacionAnulada {
  estado: string | null;
  /** `proximo_reintento` puesto: el dunning lo tiene en cola. */
  programado: boolean;
  /** PaymentIntent, Checkout o cobro de mostrador enlazado: puede haber dinero en camino. */
  conCobroEnCamino: boolean;
  /** Ya se ha pedido devolverlo, o ya se devolvió entero (`devolucionEnMarcha`). */
  devolucionEnMarcha: boolean;
}

/**
 * ¿Ya se está devolviendo el dinero de un recibo cobrado? Sí si la devolución ya
 * cubre el importe (`importe_devuelto`, que escriben el webhook y el reembolso), o
 * si Tentare la pidió (`reembolso_solicitado_en`) y Stripe no la ha rechazado
 * (`reembolso_fallido_en`: el webhook de un refund fallido lo pone y deja la marca
 * de solicitado tal cual, así que solicitado a secas no basta).
 *
 * Es lo que corta el aviso horario del barrido de anuladas: el recibo sigue
 * COBRADO hasta que el webhook lo pase a DEVUELTO, y mientras tanto avisaba cada
 * hora de algo que alguien ya estaba resolviendo.
 *
 * ⚠️ Pedida a secas solo calla `PLAZO_DEVOLUCION_SIN_CONFIRMAR_DIAS`: si el
 * webhook no llega nunca, el recibo se quedaría COBRADO para siempre sin que nada
 * volviera a avisar. Pasado el plazo (o con una fecha ilegible) se vuelve a avisar.
 */
export const PLAZO_DEVOLUCION_SIN_CONFIRMAR_DIAS = 7;

export function devolucionEnMarcha(r: {
  importe: number | null; importeDevuelto: number | null;
  reembolsoSolicitadoEn: string | null; reembolsoFallidoEn: string | null;
}, ahora: Date): boolean {
  const importe = Number(r.importe ?? 0);
  const devuelto = Number(r.importeDevuelto ?? 0);
  if (devuelto > 0 && devuelto >= importe) return true;
  if (!r.reembolsoSolicitadoEn || r.reembolsoFallidoEn) return false;
  const pedida = Date.parse(r.reembolsoSolicitadoEn);
  if (!Number.isFinite(pedida)) return false;
  return ahora.getTime() - pedida < PLAZO_DEVOLUCION_SIN_CONFIRMAR_DIAS * 24 * 3600_000;
}

/** Alertas del barrido a Sentry. Solo ids. */
export type AlertaReciboAnulado =
  /** Se cobró antes de soltarlo: hay que devolverlo a mano. Se queda apuntado. */
  | 'RECIBO_COBRADO_DE_PENALIZACION_ANULADA'
  /** Programado, en curso o con un cobro en camino: no se borra. */
  | 'RECIBO_NO_BORRABLE_DE_PENALIZACION_ANULADA'
  /** Soltado, pero el borrado no tocó fila: se vuelve a apuntar. */
  | 'NO_SE_PUDO_BORRAR_RECIBO'
  /** Y además no se pudo volver a apuntar: el recibo queda sin penalización que apunte a él. */
  | 'NO_SE_PUDO_VOLVER_A_APUNTAR';

export type DestinoReciboAnulado = 'BORRAR' | 'AVISAR_COBRADO' | 'AVISAR_NO_BORRABLE' | 'NADA';

/**
 * - PENDIENTE, sin programar y sin cobro en camino → se suelta y se borra.
 * - COBRADO → no se borra: el dinero entró y hay que devolverlo a mano. Con la
 *   devolución ya en marcha, nada: está resuelto y avisar cada hora es ruido.
 * - PENDIENTE con algo en camino, o EN_CURSO → no se borra: puede entrar dinero.
 * - FALLIDO, DEVUELTO u otro → nada. Nadie lo cobra solo (dunning, Cobros y el
 *   checkout leen la penalización), y el mostrador tampoco con la penalización
 *   anulada; ya tuvo un intento de cobro, así que su historia no se borra.
 */
export function destinoDelReciboAnulado(r: ReciboDePenalizacionAnulada): DestinoReciboAnulado {
  if (r.estado === 'COBRADO') return r.devolucionEnMarcha ? 'NADA' : 'AVISAR_COBRADO';
  if (r.estado === 'PENDIENTE') return r.programado || r.conCobroEnCamino ? 'AVISAR_NO_BORRABLE' : 'BORRAR';
  if (r.estado === 'EN_CURSO') return 'AVISAR_NO_BORRABLE';
  return 'NADA';
}

/** Estados del recibo que el barrido lee. Fuera los que dan `NADA`, para no releerlos cada hora. */
export const ESTADOS_RECIBO_BARRIDO_ANULADAS = ['PENDIENTE', 'COBRADO', 'EN_CURSO'] as const;

/** Acceso a datos del barrido, inyectado para probar el orden sin Supabase. */
export interface IoReciboDePenalizacionAnulada {
  /** CAS: `recibo_id = null`, solo si la penalización sigue OMITIDA_* y apuntando a este recibo. */
  soltarRecibo(): Promise<{ error: boolean; tocadas: number }>;
  /** `borrarReciboDePenalizacionSinCobro`: PENDIENTE, sin programar, sin cobro en camino. */
  borrarRecibo(): Promise<{ error: boolean; tocadas: number }>;
  /** CAS: `recibo_id = <este recibo>`, solo si la penalización sigue sin apuntar a ninguno. */
  volverAApuntar(): Promise<{ error: boolean; tocadas: number }>;
  alertar(motivo: AlertaReciboAnulado): void;
}

export type SueltaReciboAnulado =
  | { paso: 'BORRADO' }
  | { paso: 'AVISADO'; motivo: AlertaReciboAnulado }
  | { paso: 'NADA' }
  /** El CAS no tocó fila: la penalización cambió entre medias. */
  | { paso: 'SIN_EFECTO' }
  /** Error al soltar: no se borra nada, la hora siguiente lo repite. */
  | { paso: 'ERROR_SOLTAR' }
  | { paso: 'NO_BORRADO'; reapuntado: boolean };

/**
 * Soltar primero y borrar después: la FK `penalizaciones.recibo_id` no tiene ON
 * DELETE y no deja borrar un recibo apuntado. Si el borrado no toca fila (se
 * cobró o se programó entre la lectura y el DELETE, o dio error), se vuelve a
 * apuntar: así lo ve el barrido siguiente, que avisa si se cobró, y los guardias
 * que leen por `recibo_id` (Cobros, dunning, checkout) siguen viendo la
 * penalización anulada.
 */
export async function soltarReciboDePenalizacionAnulada(
  io: IoReciboDePenalizacionAnulada, recibo: ReciboDePenalizacionAnulada,
): Promise<SueltaReciboAnulado> {
  const destino = destinoDelReciboAnulado(recibo);
  if (destino === 'NADA') return { paso: 'NADA' };
  if (destino !== 'BORRAR') {
    const motivo = destino === 'AVISAR_COBRADO' ? 'RECIBO_COBRADO_DE_PENALIZACION_ANULADA' : 'RECIBO_NO_BORRABLE_DE_PENALIZACION_ANULADA';
    io.alertar(motivo);
    return { paso: 'AVISADO', motivo };
  }
  const suelta = await io.soltarRecibo();
  if (suelta.error) return { paso: 'ERROR_SOLTAR' };
  if (suelta.tocadas === 0) return { paso: 'SIN_EFECTO' };
  const borrado = await io.borrarRecibo();
  if (!borrado.error && borrado.tocadas > 0) return { paso: 'BORRADO' };
  const vuelta = await io.volverAApuntar();
  const reapuntado = !vuelta.error && vuelta.tocadas > 0;
  io.alertar(reapuntado ? 'NO_SE_PUDO_BORRAR_RECIBO' : 'NO_SE_PUDO_VOLVER_A_APUNTAR');
  return { paso: 'NO_BORRADO', reapuntado };
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

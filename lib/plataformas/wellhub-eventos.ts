// Los webhooks de Wellhub y las respuestas que les damos, sin base de datos.
//
// Tres traducciones y nada más:
//   1. el cuerpo que manda Wellhub → un evento validado (`leerEventoWellhub`);
//   2. por qué Tentare no acepta una reserva → el PATCH que Wellhub entiende
//      (`respuestaReservaWellhub`, con su `reason_category`);
//   3. lo que contesta su validación de check-in → qué ha pasado (`leerValidacionWellhub`).
//
// La decisión de si hay plaza NO vive aquí: la toma la RPC transaccional de
// siempre (`reservar_plaza_externa`), con su candado, como cualquier reserva.
//
// Su documentación se contradice en nombres y unidades (ver los `AMBIGUO` del
// contrato): los tipos de evento llegan con varias grafías, los ids pueden venir
// como número o como texto y los instantes en segundos (check-ins) o en
// milisegundos (reservas). Se acepta lo documentado en cualquiera de sus formas.
//
// Datos personales: de la socia solo se guarda su Wellhub ID y su nombre (lo que
// hace falta para reconocerla en la lista de la clase y validar su check-in).
// Ni email ni teléfono, aunque Wellhub los mande.
//
// Puro y sin `@/`: lo prueba `node --test`.

export type EventoWellhub =
  | {
    tipo: 'reserva-pedida';
    eventId: string | null;
    bookingNumber: string;
    slotId: string;
    gymId: string;
    classId: string | null;
    wellhubId: string;
    nombre: string;
    /** Epoch en ms. */
    momento: number;
  }
  | {
    tipo: 'reserva-cancelada' | 'reserva-cancelada-tarde';
    eventId: string | null;
    bookingNumber: string;
    slotId: string | null;
    gymId: string | null;
    wellhubId: string | null;
    momento: number;
  }
  | {
    tipo: 'checkin';
    /** `checkin-booking-occurred`: la socia tiene una clase reservada; trae su booking_number. */
    bookingNumber: string | null;
    gymId: string;
    wellhubId: string;
    nombre: string | null;
    momento: number;
    /** Hasta cuándo se puede validar (solo lo trae el de reserva). Epoch en ms. */
    expira: number | null;
  }
  | {
    tipo: 'integracion-pedida';
    eventId: string | null;
    gymId: string;
    nombreGym: string | null;
    momento: number;
  };

export type LecturaEventoWellhub = { ok: true; evento: EventoWellhub } | { ok: false; error: string };

type TipoNormalizado =
  | 'booking-requested' | 'booking-canceled' | 'booking-late-canceled'
  | 'checkin-booking-occurred' | 'checkin' | 'system-integration-requested';

/**
 * El tipo de evento en una sola grafía. La documentación usa varias para el
 * mismo evento («booking.Cancelation», «booking-cancelled», «Checkin-booking-occured»,
 * «SYSTEM_INTEGRATION_REQUESTED»…).
 */
export function tipoEventoWellhub(bruto: unknown): TipoNormalizado | null {
  if (typeof bruto !== 'string') return null;
  const t = bruto.trim().toLowerCase().replace(/[._\s]+/g, '-')
    .replace(/cancellation|cancelation|cancelled/g, 'canceled')
    .replace(/latecanceled/g, 'late-canceled')
    .replace(/occured/g, 'occurred');
  const conocidos: readonly TipoNormalizado[] = [
    'booking-requested', 'booking-canceled', 'booking-late-canceled',
    'checkin-booking-occurred', 'checkin', 'system-integration-requested',
  ];
  return (conocidos as readonly string[]).includes(t) ? (t as TipoNormalizado) : null;
}

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Un id que puede llegar como número o como texto («BK_A1B2C3», 9325). */
function id(v: unknown, max = 64): string | null {
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return String(v);
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s && s.length <= max && /^[A-Za-z0-9_-]+$/.test(s) ? s : null;
}

function texto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/\s+/g, ' ');
  return s ? s.slice(0, max) : null;
}

/**
 * Un instante de Wellhub en ms. Las reservas lo mandan en milisegundos y los
 * check-ins en segundos (y su doc enseña los dos en el mismo campo): por debajo
 * de 10^11 no puede ser un epoch en ms de este siglo, así que son segundos.
 */
export function instanteWellhub(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
  return v < 1e11 ? Math.round(v * 1000) : Math.round(v);
}

const MAX_NOMBRE = 120;

export function leerEventoWellhub(cuerpo: unknown): LecturaEventoWellhub {
  const c = objeto(cuerpo);
  if (!c) return { ok: false, error: 'el cuerpo no es un objeto JSON' };
  const tipo = tipoEventoWellhub(c.event_type);
  if (!tipo) return { ok: false, error: 'event_type desconocido' };
  const d = objeto(c.event_data);
  if (!d) return { ok: false, error: 'falta event_data' };
  const eventId = id(d.event_id, 100);
  const momento = instanteWellhub(d.timestamp) ?? Date.now();
  const usuario = objeto(d.user);
  const wellhubId = id(usuario?.unique_token);

  if (tipo === 'booking-requested' || tipo === 'booking-canceled' || tipo === 'booking-late-canceled') {
    const slot = objeto(d.slot);
    const bookingNumber = id(slot?.booking_number, 100);
    if (!bookingNumber) return { ok: false, error: 'falta slot.booking_number' };
    const slotId = id(slot?.id);
    const gymId = id(slot?.gym_id);
    if (tipo === 'booking-requested') {
      if (!slotId) return { ok: false, error: 'falta slot.id' };
      if (!gymId) return { ok: false, error: 'falta slot.gym_id' };
      if (!wellhubId) return { ok: false, error: 'falta user.unique_token' };
      const nombre = texto(usuario?.name, MAX_NOMBRE)
        ?? texto([usuario?.first_name, usuario?.last_name].filter(x => typeof x === 'string').join(' '), MAX_NOMBRE)
        ?? 'Socia de Wellhub';
      return {
        ok: true,
        evento: { tipo: 'reserva-pedida', eventId, bookingNumber, slotId, gymId, classId: id(slot?.class_id), wellhubId, nombre, momento },
      };
    }
    return {
      ok: true,
      evento: {
        tipo: tipo === 'booking-canceled' ? 'reserva-cancelada' : 'reserva-cancelada-tarde',
        eventId, bookingNumber, slotId, gymId, wellhubId, momento,
      },
    };
  }

  if (tipo === 'checkin' || tipo === 'checkin-booking-occurred') {
    const gym = objeto(d.gym);
    const gymId = id(gym?.id);
    if (!gymId) return { ok: false, error: 'falta gym.id' };
    if (!wellhubId) return { ok: false, error: 'falta user.unique_token' };
    const nombre = texto(usuario?.name, MAX_NOMBRE)
      ?? texto([usuario?.first_name, usuario?.last_name].filter(x => typeof x === 'string').join(' '), MAX_NOMBRE);
    return {
      ok: true,
      evento: {
        tipo: 'checkin',
        bookingNumber: tipo === 'checkin-booking-occurred' ? id(objeto(d.booking)?.booking_number, 100) : null,
        gymId, wellhubId, nombre, momento,
        expira: instanteWellhub(d.expires_at),
      },
    };
  }

  const gymId = id(d.gym_id);
  if (!gymId) return { ok: false, error: 'falta gym_id' };
  return { ok: true, evento: { tipo: 'integracion-pedida', eventId, gymId, nombreGym: texto(d.gym_name, 200), momento } };
}

// ── La respuesta a una reserva (PATCH /booking/v2/gyms/:gym_id/bookings/:booking_number)

/** `reason_category` que admite Wellhub (tabla de su doc, con su grafía). */
export type CategoriaRechazoWellhub =
  | 'CLASS_IS_FULL'
  | 'USER_IS_ALREADY_BOOKED'
  | 'CLASS_HAS_BEEN_CANCELED'
  | 'CLASS_NOT_FOUND'
  | 'CHECK_IN_AND_CANCELATION_WINDOWS_CLOSED'
  | 'PREREQUISITES'
  | 'TECHNICAL_ERROR';

export type CuerpoRespuestaReservaWellhub =
  | { status: 'RESERVED' }
  | { status: 'REJECTED'; reason: string; reason_category: CategoriaRechazoWellhub }
  | { status: 'CANCELLED_BY_GYM'; reason: string };

/**
 * Lo que contesta `reservar_plaza_externa` (su excepción), en el idioma de
 * Wellhub. El `reason` lo puede enseñar a su socia: inglés llano, sin detalles
 * internos. Lo desconocido es un fallo nuestro (TECHNICAL_ERROR), no algo que
 * la socia pueda arreglar.
 */
export function rechazoWellhub(mensajeRpc: string): { reason: string; reason_category: CategoriaRechazoWellhub } {
  if (mensajeRpc.includes('AFORO_LLENO') || mensajeRpc.includes('CUPO_PLATAFORMA_AGOTADO')) {
    return { reason: 'Class is full', reason_category: 'CLASS_IS_FULL' };
  }
  if (mensajeRpc.includes('YA_RESERVADA')) return { reason: 'Already booked in this class', reason_category: 'USER_IS_ALREADY_BOOKED' };
  if (mensajeRpc.includes('SESION_CANCELADA') || mensajeRpc.includes('ESTUDIO_CERRADO')) {
    return { reason: 'Class has been cancelled', reason_category: 'CLASS_HAS_BEEN_CANCELED' };
  }
  if (mensajeRpc.includes('SESION_NO_ENCONTRADA')) return { reason: 'Class not found', reason_category: 'CLASS_NOT_FOUND' };
  if (mensajeRpc.includes('SESION_TERMINADA')) {
    return { reason: 'Booking window is closed', reason_category: 'CHECK_IN_AND_CANCELATION_WINDOWS_CLOSED' };
  }
  if (mensajeRpc.includes('TIPO_REQUIERE_AUTORIZACION')) {
    return { reason: 'This class requires a previous introduction at the studio', reason_category: 'PREREQUISITES' };
  }
  return { reason: 'Booking could not be completed', reason_category: 'TECHNICAL_ERROR' };
}

/**
 * Qué significa lo que contesta Wellhub a una llamada que cambia algo (el PATCH
 * de una reserva). Se decide con su respuesta, nunca con el reloj:
 *  · 2xx → hecho;
 *  · 4xx → no lo va a aceptar: es definitivo. Salvo 401 y 403, que hablan de
 *    nuestras credenciales y no de la reserva, y 408 y 429, que hablan de su prisa;
 *  · sin respuesta, esos cuatro o 5xx → no se sabe: se vuelve a intentar.
 */
export function desenlaceWellhub(status: number): 'hecho' | 'definitivo' | 'sin-saber' {
  if (status >= 200 && status < 300) return 'hecho';
  if (status >= 400 && status < 500 && ![401, 403, 408, 429].includes(status)) return 'definitivo';
  return 'sin-saber';
}

/**
 * Lo que tarda como mucho una llamada a Wellhub (10 s), con mucho margen. Quien
 * coge una reserva para confirmarla (`estado_externo = 'Confirming'`) la tiene
 * para él este rato y nadie más le manda nada a Wellhub de ella: dos RESERVED a
 * la vez (el webhook repetido tras un arranque en frío) podían acabar en un 204
 * y un 4xx. Pasado este rato, se da por perdido y se puede reintentar.
 */
export const CESION_CONFIRMACION_MS = 2 * 60_000;

export type AccionReservaWellhub = 'confirmar' | 'rechazar' | 'anular' | 'esperar' | 'nada';

/**
 * Qué le falta saber a Wellhub de una reserva suya, según cómo está aquí
 * (`estado`) y lo que ya se le ha dicho allí (`estadoExterno`):
 *  · 'Requested' (aquí tiene plaza; allí aún no se ha dicho nada): RESERVED; si
 *    aquí ya se canceló, REJECTED.
 *  · 'Confirming' (un RESERVED pudo llegar): si nadie la tiene cogida, se
 *    reintenta; si aquí ya se canceló, se anula allí.
 *  · 'Booked' y aquí cancelada (la canceló el estudio): se anula allí. Si no, la
 *    socia la seguiría viendo reservada en su app.
 */
export function accionReservaWellhub(
  r: { estado: string; estadoExterno: string | null; estadoExternoEn: string | null }, ahora: number,
): AccionReservaWellhub {
  const cancelada = r.estado === 'CANCELADA';
  switch (r.estadoExterno) {
    case 'Requested':
      return cancelada ? 'rechazar' : 'confirmar';
    case 'Confirming': {
      const desde = Date.parse(r.estadoExternoEn ?? '');
      if (Number.isFinite(desde) && ahora - desde < CESION_CONFIRMACION_MS) return 'esperar';
      return cancelada ? 'anular' : 'confirmar';
    }
    case 'Booked':
      return cancelada ? 'anular' : 'nada';
    default:
      return 'nada';
  }
}

/**
 * Qué se hace con lo que contesta Wellhub a un RESERVED. `primera`: nadie había
 * mandado antes un RESERVED de esta reserva (se cogió de 'Requested'). Si alguno
 * pudo llegar, un 4xx no prueba que Wellhub no la tenga confirmada —su doc no
 * dice si el PATCH se puede repetir— y se conserva la plaza: que una socia
 * llegue con su reserva y no tenga sitio es mucho peor que una plaza vacía. Un
 * 404 sí lo prueba (no conoce la reserva).
 */
export function trasConfirmarWellhub(status: number, primera: boolean): 'reservada' | 'rechazada' | 'dudosa' | 'reintentar' {
  const d = desenlaceWellhub(status);
  if (d === 'hecho') return 'reservada';
  if (d === 'sin-saber') return 'reintentar';
  return primera || status === 404 ? 'rechazada' : 'dudosa';
}

/**
 * Wellhub rechaza sola una reserva que nadie contestó en 15 min. Una petición
 * que llega (o se reintenta) más tarde ya no se puede aceptar: no se le da plaza.
 */
export const MINUTOS_PARA_CONTESTAR_RESERVA = 15;
export function reservaPedidaCaducada(momentoMs: number, ahoraMs: number): boolean {
  return ahoraMs - momentoMs > MINUTOS_PARA_CONTESTAR_RESERVA * 60_000;
}

/** Margen alrededor de la clase en el que su check-in cuenta para ella (Wellhub abre el check-in 30 min antes). */
export const MARGEN_CHECKIN_MS = 30 * 60_000;

/**
 * La reserva de Wellhub a la que corresponde un check-in SIN booking_number
 * (el evento `checkin`): la de una clase cuyo margen lo contiene; si hubiera
 * varias, la que empieza más cerca. Con booking_number se casa por él, exacto.
 */
export function reservaDelCheckinWellhub<T extends { inicio: string; fin: string }>(
  reservas: readonly T[], momentoMs: number,
): T | null {
  let mejor: T | null = null;
  let distancia = Number.POSITIVE_INFINITY;
  for (const r of reservas) {
    const inicio = Date.parse(r.inicio);
    const fin = Date.parse(r.fin);
    if (momentoMs < inicio - MARGEN_CHECKIN_MS || momentoMs > fin + MARGEN_CHECKIN_MS) continue;
    const d = Math.abs(inicio - momentoMs);
    if (d < distancia) { mejor = r; distancia = d; }
  }
  return mejor;
}

// ── Validar un check-in (POST /access/v1/validate)

export type ResultadoValidacionWellhub =
  | 'validado'
  | 'ya-validado'
  | 'sin-checkin'
  | 'caducado'
  | 'cancelado'
  | 'sin-permiso'
  | 'error';

/**
 * Qué ha pasado al validar. «Ya validado» cuenta como hecho (Wellhub nunca
 * registra dos validaciones del mismo acceso). Sus claves de error salen de los
 * diagramas de su doc: `checkin.validation.notfound|cancelled|expired` y
 * `checkin.already.validated`.
 */
export function leerValidacionWellhub(status: number, json: unknown): ResultadoValidacionWellhub {
  if (status >= 200 && status < 300) return 'validado';
  if (status === 401 || status === 403) return 'sin-permiso';
  const errores = (objeto(json)?.errors as unknown[] | undefined) ?? [];
  const claves = errores.map(e => objeto(e)?.key).filter((k): k is string => typeof k === 'string');
  if (claves.some(k => k === 'checkin.already.validated')) return 'ya-validado';
  if (claves.some(k => k.endsWith('notfound') || k.endsWith('not-found'))) return 'sin-checkin';
  if (claves.some(k => k.endsWith('expired'))) return 'caducado';
  if (claves.some(k => k.endsWith('cancelled') || k.endsWith('canceled'))) return 'cancelado';
  if (status === 404) return 'sin-checkin';
  return 'error';
}

/** Para recepción: qué ha dicho Wellhub, en su idioma. `null` = todo bien. */
export function avisoValidacionWellhub(r: ResultadoValidacionWellhub): string | null {
  switch (r) {
    case 'validado':
    case 'ya-validado':
      return null;
    case 'sin-checkin':
      return 'Wellhub no tiene su check-in de hoy: que lo haga en su app y vuelve a marcarla.';
    case 'caducado':
      return 'Su check-in de Wellhub ha caducado: tiene que hacer otro en su app.';
    case 'cancelado':
      return 'Canceló su check-in en la app de Wellhub.';
    case 'sin-permiso':
      return 'Wellhub ha rechazado la conexión de Tentare. Avísanos para revisarla.';
    case 'error':
      return 'Wellhub no ha contestado. Vuelve a marcarla en un momento.';
  }
}

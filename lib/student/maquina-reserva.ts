// `lib/booking-machine.ts` del paquete de diseño: estados, transiciones y COPY.
//
// El COPY es LITERAL del paquete y no se toca — el handoff lo marca como «no
// cambiar» (§L) porque es lo que la alumna lee en el peor momento: cuando su
// reserva no ha salido.
//
// Lo que sí cambia respecto al paquete es de dónde sale la verdad:
//   · `disponibilidad()` sigue siendo un cálculo de PINTURA. Lo que enseña es
//     orientativo y el servidor manda — el aforo del cliente no resta las
//     máquinas averiadas (`aforo_efectivo`), así que puede enseñar una plaza
//     que no existe. Por eso la máquina nunca pinta `confirmed` sin respuesta.
//   · `cancelable()` del paquete decide con `Date.now()` en el navegador si se
//     devuelve el crédito. Aquí NO decide: solo dice qué enseñar. Quien decide
//     es `cancelar_reserva_plaza`, que devuelve `devolver_bono` como columna, y
//     la ventana real es una cascada `tipos_clase.ventana_cancelacion_horas ??
//     studios.cancelacion_ventana_horas`, no un número global.

import type { BookingState, Clase, Disponibilidad, Reserva } from './tipos';

/** Disponibilidad visible de una clase PARA ESTA alumna. */
export function disponibilidad(c: Clase, reservas: Reserva[], soportaEspera: boolean): Disponibilidad {
  const mia = reservas.find((r) => r.claseId === c.id && (r.estado === 'confirmada' || r.estado === 'en-espera'));
  if (mia?.estado === 'confirmada') return 'reservada';
  if (mia?.estado === 'en-espera') return 'lista-espera';
  if (c.plazasLibres <= 0) return soportaEspera ? 'completa' : 'no-disponible';
  if (c.plazasLibres <= 2) return 'pocas';
  return 'disponible';
}

export interface AvisoCancelacion {
  /** ¿La clase todavía no ha empezado? */
  puede: boolean;
  /** Lo que se le ANUNCIA a la alumna. La decisión final es del servidor. */
  devolveriaCredito: boolean;
  horasRestantes: number;
}

/**
 * Qué avisarle antes de cancelar.
 *
 * ⚠️ Esto NO decide nada. El nombre lleva «avisar» y no «puede cancelar» a
 * propósito: la política real vive en la base de datos y puede diferir de este
 * cálculo (el tipo de clase puede tener su propia ventana). Se usa para
 * escribir «con menos de N h no recuperas la sesión» antes de pulsar, no para
 * habilitar o bloquear la acción.
 *
 * `horasPolitica` tiene que venir ya resuelto por el servidor con la cascada
 * tipo → estudio. Pasar aquí un número global sería volver al bug que el
 * paquete trae de serie.
 */
export function avisoCancelacion(c: Clase, horasPolitica: number, ahora: Date = new Date()): AvisoCancelacion {
  // La cascada del servidor: la ventana del TIPO de clase manda sobre la del
  // estudio (`tipos_clase.ventana_cancelacion_horas ?? studios.cancelacion_ventana_horas`).
  // Sin esto, una clase con política propia se anunciaba con la del estudio.
  const horas = c.ventanaCancelacionHoras ?? horasPolitica;
  const inicio = new Date(c.fecha + 'T' + c.hora + ':00').getTime();
  const restan = (inicio - ahora.getTime()) / 36e5;
  return {
    puede: restan > 0,
    devolveriaCredito: restan >= horas,
    horasRestantes: Math.max(0, Math.floor(restan)),
  };
}

/** Transiciones válidas. Literal del paquete. */
export const TRANSICIONES: Record<BookingState, BookingState[]> = {
  idle: ['reviewing'],
  reviewing: ['submitting', 'idle', 'offline'],
  submitting: ['confirmed', 'waitlisted', 'full', 'conflict', 'duplicate', 'session-expired', 'error', 'offline'],
  confirmed: [], waitlisted: [],
  full: ['reviewing', 'idle'], conflict: ['idle'], duplicate: ['idle'],
  'session-expired': ['idle'], offline: ['reviewing'], error: ['reviewing', 'idle'],
};

/** ¿Se puede pasar de `de` a `a`? Para no pintar un estado imposible. */
export function transicionValida(de: BookingState, a: BookingState): boolean {
  return TRANSICIONES[de].includes(a);
}

export type EstadoFinal = Exclude<BookingState, 'idle' | 'reviewing' | 'submitting'>;

/** Copy LITERAL del paquete (§L: no cambiar). */
export const COPY: Record<EstadoFinal, { titulo: string; cuerpo: string; tono: 'ok' | 'warn' | 'error' }> = {
  confirmed: { titulo: 'Reserva confirmada', cuerpo: 'Te esperamos. Te avisamos el día antes.', tono: 'ok' },
  waitlisted: { titulo: 'Estás en la lista de espera', cuerpo: 'Te avisamos al momento si se libera una plaza.', tono: 'warn' },
  full: { titulo: 'Se ha llenado mientras reservabas', cuerpo: 'Otra alumna ha cogido la última plaza. Puedes apuntarte a la lista de espera o elegir otra hora.', tono: 'warn' },
  conflict: { titulo: 'Ya tienes una clase a esa hora', cuerpo: 'Coincide con otra reserva tuya. Cancela una de las dos para continuar.', tono: 'warn' },
  duplicate: { titulo: 'Ya estabas apuntada', cuerpo: 'Esta clase ya está en tus reservas. No se ha creado ninguna nueva.', tono: 'warn' },
  'session-expired': { titulo: 'Tu sesión ha caducado', cuerpo: 'Vuelve a iniciar sesión para reservar. No se ha hecho ningún cargo.', tono: 'error' },
  offline: { titulo: 'Sin conexión', cuerpo: 'No podemos confirmar la reserva sin conexión. Inténtalo cuando vuelvas a tener red — no se ha hecho ningún cargo.', tono: 'error' },
  error: { titulo: 'Algo no ha salido como esperábamos', cuerpo: 'Tu reserva no se ha completado y no se ha usado ninguna sesión. Inténtalo de nuevo.', tono: 'error' },
};

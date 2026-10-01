// Webhooks de estado de reserva de Urban Sports Club, sin base de datos.
//
// Tras el Instant Booking, USC nos cuenta por webhook lo que pasa después:
// Cancelled, LateCancellation, CheckedIn, NoShow (docs: endpoint/bookings). Aquí
// solo se traduce: el cuerpo → un evento validado, y el estado → qué hace
// Tentare con la reserva.
//
// ⚠️ El orden de entrega NO está garantizado: manda `ModifiedDate`. Un webhook
// más viejo que el último aplicado se ignora (`esMasReciente`).
// ⚠️ Los de `BookingType = FreeTraining` (entradas sin clase) no son reservas de
// una clase de Tentare: se aceptan y se ignoran.

export type EstadoUsc = 'Booked' | 'Cancelled' | 'LateCancellation' | 'CheckedIn' | 'NoShow';

export interface EventoReservaUsc {
  reservaExternaId: string;
  estado: EstadoUsc;
  /** ISO. Cuándo cambió en USC: decide el orden. */
  modificado: string;
  clienteExternoId: string | null;
  tipo: 'Class' | 'FreeTraining' | 'Otro';
}

const ESTADOS: readonly EstadoUsc[] = ['Booked', 'Cancelled', 'LateCancellation', 'CheckedIn', 'NoShow'];

export function leerWebhookReservaUsc(cuerpo: unknown): { ok: true; evento: EventoReservaUsc } | { ok: false; error: string } {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return { ok: false, error: 'cuerpo no es un objeto' };
  const c = cuerpo as Record<string, unknown>;
  const id = typeof c.Id === 'string' ? c.Id.trim().toLowerCase() : '';
  if (!id) return { ok: false, error: 'falta Id' };
  const estado = c.BookingStatus;
  if (typeof estado !== 'string' || !(ESTADOS as readonly string[]).includes(estado)) return { ok: false, error: 'BookingStatus desconocido' };
  const modificado = typeof c.ModifiedDate === 'string' ? c.ModifiedDate : '';
  if (!modificado || Number.isNaN(Date.parse(modificado))) return { ok: false, error: 'ModifiedDate no válida' };
  const tipo = c.BookingType === 'Class' ? 'Class' : c.BookingType === 'FreeTraining' ? 'FreeTraining' : 'Otro';
  const cliente = typeof c.CustomerId === 'string' || typeof c.CustomerId === 'number' ? String(c.CustomerId) : null;
  return { ok: true, evento: { reservaExternaId: id, estado: estado as EstadoUsc, modificado, clienteExternoId: cliente, tipo } };
}

/** Qué le pasa a la reserva en Tentare con cada estado de USC. */
export type AccionUsc = 'cancelar' | 'asistio' | 'no-vino' | 'nada';

export function accionDeEstadoUsc(estado: EstadoUsc): AccionUsc {
  switch (estado) {
    case 'Cancelled':
    case 'LateCancellation':
      // A quien viene de USC no le penaliza el estudio (lo hace su plataforma):
      // las dos se cancelan igual en Tentare, y la plaza vuelve al grupo común.
      return 'cancelar';
    case 'CheckedIn':
      return 'asistio';
    case 'NoShow':
      return 'no-vino';
    case 'Booked':
      // La reserva ya entró por el Instant Booking: no hay nada que hacer.
      return 'nada';
  }
}

/** ¿Este webhook es posterior al último aplicado? (Sin ninguno aplicado, sí.) */
export function esMasReciente(modificado: string, ultimoAplicado: string | null): boolean {
  if (!ultimoAplicado) return true;
  return Date.parse(modificado) > Date.parse(ultimoAplicado);
}

/**
 * Del estado actual de la reserva en Tentare, ¿se puede aplicar la acción?
 * Una cancelada no vuelve a la vida por un CheckedIn tardío, y lo que ya está
 * en el estado pedido no se toca (idempotencia ante reenvíos).
 */
export function aplicableSobre(estadoTentare: string, accion: AccionUsc): boolean {
  if (accion === 'nada') return false;
  if (estadoTentare === 'CANCELADA') return false;
  if (accion === 'cancelar') return true;
  if (accion === 'asistio') return estadoTentare !== 'ASISTIDA';
  return estadoTentare !== 'NO_ASISTIO';
}

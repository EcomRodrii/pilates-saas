// Auditoría 20ª pasada (F-16): el mensaje que se muestra justo tras reservar
// (¿confirmada? ¿lista de espera? ¿pendiente de aprobar? ¿el sitio elegido se
// lo dieron o no?) se construía por separado en cada pantalla que llama a
// `addReserva`. Una de las tres (components/portal/portal-clases-view.tsx)
// ya distinguía el caso "reservada pero el sitio elegido lo cogieron antes"
// (bug #500 en pequeño); las otras dos decían "Reservada. Te esperamos."
// pasara lo que pasara con el sitio, y una de ellas tampoco distinguía
// PENDIENTE_APROBACION de CONFIRMADA. Tres implementaciones = tres formas de
// volver a divergir. Una sola función pura, sin React, para que las tres
// pantallas digan siempre lo mismo cuando pase lo mismo.

import type { EstadoReserva } from './types.ts';

export interface ResultadoParaMensaje {
  estado: EstadoReserva;
  /** El sitio que el servidor pudo darle, o `null`/`undefined` si no aplica
   *  o no se pudo. Ver `ResultadoReserva.spotAsignado` en studio-context. */
  spotAsignado?: string | null;
}

/**
 * El mensaje canónico tras confirmar una reserva (self-service: portal o
 * widget público). Cuatro desenlaces posibles, en este orden de prioridad:
 * lista de espera > pendiente de aprobar > sitio elegido no conseguido >
 * confirmada sin más.
 */
export function mensajeConfirmarReserva(r: ResultadoParaMensaje, spotElegido: string | null): string {
  if (r.estado === 'LISTA_ESPERA') {
    return 'La clase estaba completa: te hemos puesto en la lista de espera.';
  }
  if (r.estado === 'PENDIENTE_APROBACION') {
    return 'Reserva enviada: queda pendiente de aprobación.';
  }
  if (spotElegido && !r.spotAsignado) {
    return 'Reservada, pero el sitio que elegiste lo cogieron antes. Te lo asignamos al llegar.';
  }
  return 'Reservada. Te esperamos.';
}

// Lo que dice la hoja de reserva cuando contesta el servidor. Puro (desenlace-hoja.test.ts), para que la ficha de la
// clase y la fila del horario —que abren la MISMA hoja— lo digan igual.
//
// Es lo que la ficha decidía en línea tras `confirmarReserva`, movido tal cual, con un arreglo: «aforo-lleno».

import { mensajeConfirmarReserva } from '../reserva-confirmacion-mensaje.ts';
import type { BookingState } from './tipos.ts';
import type { DesenlaceReserva } from './reserva-codigos.ts';
import type { TipoAccion } from './reserva-acciones.ts';

export interface DesenlaceHoja {
  state: BookingState;
  /** Título propio (pendiente de aprobación); sin él, el de la máquina (`COPY`). */
  titulo?: string;
  /** El motivo concreto; sin él, el copy de la máquina. */
  mensaje?: string;
  /** Qué se le ofrece tras un rechazo, por el CÓDIGO del servidor. */
  acciones?: TipoAccion[];
  /** ¿Se le ofrece «Unirme a la lista de espera»? Solo si la clase la admite. */
  ofreceEspera: boolean;
}

/** Cuando el servidor dice «aforo-lleno», la clase NO admite lista de espera: solo entonces lo devuelve. */
export const LLENA_SIN_ESPERA = 'Otra alumna ha cogido la última plaza y esta clase no tiene lista de espera. Elige otra hora.';

/**
 * De la respuesta del servidor a lo que pinta la hoja.
 *
 * `spotPedido`: el sitio que eligió (o `null`), para decirle si se lo dieron.
 *
 * ⚠️ «aforo-lleno»: el servidor SOLO lo devuelve cuando la clase no admite lista de espera (`AFORO_LLENO_SIN_ESPERA`,
 * `evaluar_reserva`); con lista, la apunta y contesta `LISTA_ESPERA`. La hoja le ofrecía justo ahí «Unirme a la lista de
 * espera», que el servidor iba a rechazar. Ahora no se ofrece y el texto dice por qué.
 */
export function desenlaceDeLaHoja(r: DesenlaceReserva, spotPedido: string | null): DesenlaceHoja {
  if (r.state === 'full' && r.codigo === 'aforo-lleno') {
    return { state: r.state, mensaje: LLENA_SIN_ESPERA, acciones: r.acciones, ofreceEspera: false };
  }
  if (r.pendienteAprobacion) {
    // Ni «lista de espera» ni «te avisamos si se libera una plaza»: la plaza está, falta que el estudio diga que sí.
    return {
      state: r.state, titulo: 'Tu reserva está pendiente de aprobación',
      mensaje: 'Tienes la plaza guardada mientras el estudio la revisa. Te avisamos en cuanto la confirmen.',
      acciones: r.acciones, ofreceEspera: false,
    };
  }
  // Si pidió sitio y NO se lo dieron, se dice: llegaría convencida de tener el que eligió. Y si la reserva GASTÓ una
  // recuperación (la RPC la consume sola al topar el límite semanal), también: pasaba de 2 a 1 sin enterarse. El del
  // sitio primero: es una expectativa suya que no se ha cumplido.
  const avisoSitio = r.state === 'confirmed' && spotPedido && !r.spotAsignado
    ? mensajeConfirmarReserva({ estado: 'CONFIRMADA', spotAsignado: r.spotAsignado ?? null }, spotPedido)
    : null;
  const avisoRecuperacion = r.state === 'confirmed' && r.recuperacionUsada
    ? 'Has usado una de tus recuperaciones para esta clase.'
    : null;
  return {
    state: r.state,
    mensaje: [avisoSitio, avisoRecuperacion].filter(Boolean).join(' ') || r.mensaje,
    acciones: r.acciones,
    // «spot-ocupado» (le cogieron el sitio) sigue como hoy: vuelve a la revisión para elegir otro.
    ofreceEspera: r.state === 'full',
  };
}

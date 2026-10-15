// Las cifras de arriba de la ficha de una clase en el panel nuevo, como las de
// la sesión de Bonsai (b-41): cuántas vienen, cuántas esperan plaza, cuántas
// esperan tu visto bueno y cuántas cancelaron. Una reserva cuenta una vez, por
// su estado de ahora. Puro: se prueba con `node --test`.

import type { EstadoReserva } from '../types.ts';

export interface CifrasClase {
  /** Con plaza: confirmadas, y las que ya vinieron o faltaron. */
  apuntadas: number;
  enEspera: number;
  porAprobar: number;
  canceladas: number;
}

export function cifrasDeClase(reservas: readonly { estado: EstadoReserva }[]): CifrasClase {
  const c: CifrasClase = { apuntadas: 0, enEspera: 0, porAprobar: 0, canceladas: 0 };
  for (const r of reservas) {
    if (r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA' || r.estado === 'NO_ASISTIO') c.apuntadas++;
    else if (r.estado === 'LISTA_ESPERA') c.enEspera++;
    else if (r.estado === 'PENDIENTE_APROBACION') c.porAprobar++;
    else if (r.estado === 'CANCELADA') c.canceladas++;
  }
  return c;
}

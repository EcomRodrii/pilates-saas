// Qué es cada reserva de una clase para el mostrador, y qué pasa de verdad al
// quitarla.
//
// En la lista de una clase todas las clientas parecían iguales: nada decía que
// una venía por su plaza fija o gastando una clase para recuperar. Y el aviso al
// quitar decía «se libera su plaza» a una clienta fija, que la conserva, y nada
// sobre la recuperación que el servidor le da o le devuelve. Lógica pura: el
// panel la pinta, el servidor decide (`ejecutarCancelacionReserva`).

import { fechaCortaEstudio } from './utils.ts';
import type { EstadoReserva, Recuperacion, Reserva } from './types.ts';

export type MarcaReserva = 'fija' | 'recuperacion' | null;

/**
 * Recuperación = la reserva gastó una (`recuperaciones.usada_en_reserva_id`).
 * Fija = la creó el motor de la plaza fija (`res-pf-`). Se mira el id y no el
 * horario a propósito: una reserva hecha a mano en el horario de una fija ni la
 * cuenta el motor ni la compensa el servidor como tal.
 * Sin marca = reserva normal (no se pinta nada, para no añadir ruido).
 */
export function marcaReserva(
  r: Pick<Reserva, 'id'>,
  recuperaciones: Pick<Recuperacion, 'usadaEnReservaId' | 'estado'>[],
): MarcaReserva {
  if (recuperaciones.some(x => x.estado === 'USADA' && x.usadaEnReservaId === r.id)) return 'recuperacion';
  if (r.id.startsWith('res-pf-')) return 'fija';
  return null;
}

/** El texto del «¿Quitar a …?» antes de confirmar. */
export function avisoQuitarReserva(estado: EstadoReserva, marca: MarcaReserva): string {
  if (estado === 'LISTA_ESPERA' || estado === 'PENDIENTE_APROBACION') return 'Perderá su sitio en la lista de espera.';
  if (marca === 'fija') {
    return 'Sigue con su plaza fija: solo se quita de esta clase. Si hay lista de espera, entra la siguiente persona.';
  }
  if (marca === 'recuperacion') {
    return 'Vuelve a tener su clase para recuperar, con la misma caducidad. Si hay lista de espera, entra la siguiente persona.';
  }
  return 'Se libera su plaza — si hay lista de espera, se promociona automáticamente a la siguiente persona.';
}

/**
 * Lo que ha pasado, con lo que dijo el servidor. `null` = nada que añadir al
 * aviso de siempre (reserva normal sin recuperación).
 */
export function textoTrasQuitar(
  res: { recuperacionCreada?: boolean; recuperacionCaducaEl?: string | null; recuperacionAlCerrarSemana?: boolean },
  marca: MarcaReserva,
): string | null {
  if (res.recuperacionCreada) {
    const hasta = res.recuperacionCaducaEl ? ` hasta el ${fechaCortaEstudio(`${res.recuperacionCaducaEl}T12:00:00Z`)}` : '';
    return `Quitada · tendrá una clase para recuperar${hasta}`;
  }
  if (res.recuperacionAlCerrarSemana) {
    return 'Quitada · si no usa ese hueco esta semana, tendrá una clase para recuperar al acabarla';
  }
  if (marca === 'fija') return 'Quitada de esta clase · sigue con su plaza fija';
  if (marca === 'recuperacion') return 'Quitada · vuelve a tener su clase para recuperar';
  return null;
}

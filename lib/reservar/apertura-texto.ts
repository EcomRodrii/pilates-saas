import { diaEnEstudio } from '../calendario-hora-estudio.ts';
import { fechaLargaEstudio, horaEstudio, masDias } from '../utils.ts';

// Cuándo se abre la reserva de una clase, dicho para la alumna. Sin nada de
// servidor: lo usan el rechazo de la API («todavía no se puede reservar») y las
// pantallas públicas («Se abre…»). El instante lo calcula `instanteDeApertura`
// (lib/booking-logic.ts); aquí solo se cuenta.

/** «hoy a las 20:00», «mañana a las 20:00» o «el martes, 29 de septiembre, a las 20:00». */
export function cuandoSeAbre(abre: Date, ahora: Date): string {
  const dia = diaEnEstudio(abre);
  const hoy = diaEnEstudio(ahora);
  const hora = horaEstudio(abre);
  if (dia === hoy) return `hoy a las ${hora}`;
  if (dia === masDias(hoy, 1)) return `mañana a las ${hora}`;
  return `el ${fechaLargaEstudio(abre)}, a las ${hora}`;
}

/** El motivo del «no» del servidor, con la fecha: sin ella, «todavía no» no dice cuándo volver. */
export function mensajeTodaviaNoSeAbre(abre: Date, ahora: Date): string {
  return `Todavía no se puede reservar esta clase: se abre ${cuandoSeAbre(abre, ahora)}.`;
}

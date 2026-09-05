// Lógica pura del cierre, sin nada de IO.
//
// ⚠️ Vive aparte de `aplicar-cierre.ts` a propósito: ese importa con alias
// `@/lib/...`, y un test de `node --test` que arrastre un alias no falla — se
// cae ENTERO y desaparece del recuento sin que nadie lo note. Aquí solo hay
// imports relativos con extensión, que es lo que el runner de este repo sabe
// resolver.
import { inicioDelDiaEstudio, finDelDiaEstudio } from '../utils.ts';

/**
 * Días naturales que dura un cierre, ambos extremos incluidos.
 *
 * Es lo que se le suma a la caducidad de cada bono del estudio, así que
 * equivocarse aquí regala o roba vigencia a todo el mundo a la vez.
 *
 * ⚠️ Se redondea porque los días de cambio de hora duran 23 o 25 horas: una
 * semana de finales de marzo da 6,96 días si se divide sin más.
 */
export function diasDeCierre(desde: string, hasta: string): number {
  const ini = Date.parse(inicioDelDiaEstudio(desde));
  const fin = Date.parse(finDelDiaEstudio(hasta));
  return Math.round((fin - ini) / 86_400_000);
}

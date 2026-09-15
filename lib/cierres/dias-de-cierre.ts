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

/**
 * Lo que se añade al resumen de un cierre cuando parte de sus días ya se habían
 * sumado a los bonos: el mismo cierre reintentado, uno quitado y vuelto a poner,
 * o dos que se solapan. Sin esto, «7 días cerrados» sin «bonos prorrogados»
 * parecería que la prórroga falló. `null` = no hay nada que decir.
 */
export function notaDiasYaProrrogados(dias: number, diasYaProrrogados: number): string | null {
  if (!(diasYaProrrogados > 0)) return null;
  if (diasYaProrrogados >= dias) return 'los bonos ya tenían esos días de más';
  return diasYaProrrogados === 1
    ? '1 día ya se había sumado a los bonos'
    : `${diasYaProrrogados} días ya se habían sumado a los bonos`;
}

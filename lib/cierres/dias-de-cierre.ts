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

/**
 * Lo que pasa al cerrar, dicho ANTES de cerrar. Lo comparten «Cerrar el centro»
 * (Configuración › Mi estudio) y «Cerrar ese día» del aviso de festivos: van al
 * mismo POST /api/cierres y tienen que decir lo mismo.
 *
 * `devuelveSesion` es «Devolver la sesión al cancelar una clase entera» del
 * estudio (#1342): decir «se le devuelve» a secas mentía a quien lo tiene
 * apagado.
 */
export function consecuenciasDelCierre(p: {
  /** «Del 3 al 9 de agosto», «El martes 8 de diciembre». */
  cuando: string;
  dias: number;
  devuelveSesion: boolean;
  /** Si se sabe cuántas clases hay, se dice («sus 6 clases»). */
  clases?: number;
  /** Solo para rangos: avisar de que un día ya cerrado no suma dos veces. */
  notaSolapes?: boolean;
}): string {
  const clases = p.clases === undefined ? 'sus clases' : p.clases === 1 ? 'su clase' : `sus ${p.clases} clases`;
  const sesion = p.devuelveSesion ? ', que recupera la sesión del bono' : ', sin devolverle la sesión';
  const dias = p.dias === 1 ? '1 día' : `${p.dias} días`;
  return `${p.cuando} nadie podrá reservar. Se cancelan ${clases} avisando a quien tenía reserva${sesion}, y los bonos y `
    + `recuperaciones de todas tus alumnas duran ${dias} más.`
    + (p.notaSolapes ? ' Si alguno de esos días ya lo habías cerrado antes, no se suma dos veces.' : '');
}

/**
 * Lo que ha pasado de verdad, con las cifras que devuelve /api/cierres
 * (`ResumenCierre`). Las incidencias no se esconden detrás del éxito.
 */
export function textoTrasCerrar(data: {
  dias?: number; clasesCanceladas?: number; bonosAmpliados?: number; diasYaProrrogados?: number; incidencias?: string[];
}): string {
  const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
  const dias = Number(data.dias ?? 0);
  const partes = [`${plural(dias, 'día cerrado', 'días cerrados')}`];
  if (data.clasesCanceladas) partes.push(plural(data.clasesCanceladas, 'clase cancelada', 'clases canceladas'));
  if (data.bonosAmpliados) partes.push(plural(data.bonosAmpliados, 'bono prorrogado', 'bonos prorrogados'));
  const yaProrrogados = notaDiasYaProrrogados(dias, Number(data.diasYaProrrogados ?? 0));
  if (yaProrrogados) partes.push(yaProrrogados);
  if (data.incidencias?.length) partes.push(`con avisos: ${data.incidencias[0]}`);
  return partes.join(' · ');
}

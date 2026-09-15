// Qué se puede hacer con un cierre del centro ya puesto, y qué se le dice a la
// propietaria antes de hacerlo. Puro, sin IO: lo usan el cajón y la ruta, y así
// los dos responden lo mismo.
//
// Un cierre se APLICA al guardarlo (aplicar-cierre.ts): en ese momento cancela
// las clases, avisa, devuelve la sesión según el ajuste del estudio y alarga
// los bonos. No hay cierres «programados» que se apliquen después. Así que
// quitar uno solo puede hacer una cosa honesta: borrar la fila de
// `cierres_estudio`, con lo que `fecha_en_cierre` deja de bloquear reservas,
// plazas fijas y renovación de series esos días. Lo demás NO se deshace:
//   · las clases canceladas siguen canceladas, y sus reservas también;
//   · a las alumnas ya se les avisó, y quitarlo no avisa a nadie;
//   · la sesión devuelta y los días de más de los bonos se quedan.
// Restaurar clases o tocar bonos sería otra funcionalidad (y dinero): no se
// finge aquí. Y como los días de más se quedan, volver a poner el cierre no los
// suma otra vez: la prórroga queda apuntada en `cierres_prorrogas`, que no se
// borra con el cierre (migr 20260915212126).
//
// ⚠️ Solo imports relativos con extensión: un alias `@/` tumba el test entero
// sin que falle nada (ver dias-de-cierre.ts).
import { rangoDeFechas } from '../configuracion/resumenes.ts';

export interface CierreGuardado {
  id: string;
  desde: string;
  hasta: string;
  motivo: string | null;
}

type Rango = Pick<CierreGuardado, 'desde' | 'hasta'>;

/** `hoy` en la fecha del estudio (`YYYY-MM-DD`). Rango inclusivo por los dos lados. */
export type MomentoCierre = 'proximo' | 'en_curso' | 'pasado';

export function momentoCierre(c: Rango, hoy: string): MomentoCierre {
  if (c.hasta < hoy) return 'pasado';
  return c.desde <= hoy ? 'en_curso' : 'proximo';
}

export interface AccionCierre {
  momento: Exclude<MomentoCierre, 'pasado'>;
  boton: string;
  titulo: string;
  descripcion: string;
  textoConfirmar: string;
  /** El aviso cuando el servidor lo ha confirmado. */
  hecho: string;
}

/** Lo que NO vuelve, dicho igual en los dos casos. */
export const LO_QUE_NO_VUELVE =
  'Las clases canceladas no vuelven, ni sus reservas: créalas otra vez si las quieres. ' +
  'Los bonos se quedan con sus días de más y no se avisa a nadie. ' +
  'Si vuelves a cerrar esos días, a los bonos no se les suman otra vez.';

/**
 * Qué se ofrece para un cierre. `null` = ya pasó: no hay nada que reabrir, y
 * borrarlo solo quitaría el registro de que el centro estuvo cerrado.
 */
export function accionCierre(c: Rango, hoy: string): AccionCierre | null {
  const momento = momentoCierre(c, hoy);
  if (momento === 'pasado') return null;
  if (momento === 'proximo') {
    return {
      momento,
      boton: 'Quitar este cierre',
      titulo: `¿Quitar el cierre del ${rangoDeFechas(c.desde, c.hasta)}?`,
      descripcion: `Tus alumnas podrán volver a reservar esos días. ${LO_QUE_NO_VUELVE}`,
      textoConfirmar: 'Sí, quitar el cierre',
      hecho: 'Cierre quitado',
    };
  }
  return {
    momento,
    boton: 'Reabrir desde hoy',
    titulo: '¿Reabrir el centro desde hoy?',
    descripcion: `Tus alumnas podrán volver a reservar desde hoy. ${LO_QUE_NO_VUELVE}`,
    textoConfirmar: 'Sí, reabrir',
    hecho: 'Centro abierto de nuevo',
  };
}

/** Los que vienen (el más cercano primero) y los que ya pasaron (el más reciente primero). */
export function repartirCierres<T extends Rango>(cierres: readonly T[], hoy: string): { proximos: T[]; pasados: T[] } {
  const proximos = cierres.filter(c => c.hasta >= hoy).sort((a, b) => a.desde.localeCompare(b.desde));
  const pasados = cierres.filter(c => c.hasta < hoy).sort((a, b) => b.desde.localeCompare(a.desde));
  return { proximos, pasados };
}

/**
 * Si comparte algún día con otro cierre. Las clases canceladas no guardan QUÉ
 * cierre las canceló (solo `cancelada_motivo = 'cierre_centro'`), así que con
 * dos cierres encima el recuento de uno incluiría las del otro: no se cuenta.
 */
export function seSolapaConOtro(c: CierreGuardado, todos: readonly CierreGuardado[]): boolean {
  return todos.some(o => o.id !== c.id && o.desde <= c.hasta && c.desde <= o.hasta);
}

/**
 * La línea de un cierre en la lista: «24–26 dic» (con el año si no es el de
 * hoy) y, debajo, motivo y clases canceladas. `clases` `null` = no se sabe, y
 * no se dice nada.
 */
export function lineaCierre(c: CierreGuardado, hoy: string, clases: number | null): { fechas: string; detalle: string | null } {
  const anio = hoy.slice(0, 4);
  const conAnio = c.desde.slice(0, 4) !== anio || c.hasta.slice(0, 4) !== anio;
  const fechas = `${rangoDeFechas(c.desde, c.hasta)}${conAnio ? ` ${c.hasta.slice(0, 4)}` : ''}`;
  const partes = [
    c.motivo?.trim() || null,
    clases === null ? null : clases === 0 ? 'ninguna clase cancelada' : `${clases} ${clases === 1 ? 'clase cancelada' : 'clases canceladas'}`,
  ].filter((p): p is string => !!p);
  const detalle = partes.join(' · ');
  return { fechas, detalle: detalle ? detalle[0].toUpperCase() + detalle.slice(1) : null };
}

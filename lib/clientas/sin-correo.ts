// ─────────────────────────────────────────────────────────────────────────────
// «Alumnas sin correo»: las que no pueden entrar a la app de su estudio.
//
// La alumna entra con su correo (y un código), así que una ficha sin correo no
// puede reservar desde la app ni recibe avisos. Pasa sobre todo al cargar a mano
// o importar de una hoja sin esa columna: en octubre de 2026, un estudio con 25
// alumnas cargadas tenía 4 con correo y solo 1 con cuenta en la app, y otro con 8
// no tenía ninguna. Nadie se lo decía en ningún sitio.
//
// Aquí solo se decide A QUIÉN se cuenta y CUÁNDO se avisa. Puro, sin `@/`.
//
//   · Cuentan las fichas que viven en el estudio ahora: Activa, De prueba, Sin
//     renovar y Pausada (`estadoClienta`). No las de baja, ni las inactivas de
//     hace años, ni las interesadas que aún no han venido: avisar de ellas sería
//     ruido y el número no coincidiría con lo que le importa a quien mira.
//   · «Sin correo» = vacío o con una forma que no es una dirección. Que la
//     dirección exista de verdad no se puede saber desde aquí.
//   · Se avisa con 3 o más, o si son una de cada cuatro: un estudio de cuatro
//     alumnas con una sin correo también tiene que saberlo.
// ─────────────────────────────────────────────────────────────────────────────

export const ESTADOS_QUE_NECESITAN_CORREO = ['ACTIVA', 'DE_PRUEBA', 'SIN_RENOVAR', 'PAUSADA'] as const;

/** Desde cuántas sin correo se avisa, sea cual sea el tamaño del estudio. */
export const MINIMO_AVISO_SIN_CORREO = 3;
/** O desde qué fracción de las que viven en el estudio. */
export const FRACCION_AVISO_SIN_CORREO = 0.25;

const FORMA_DE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function tieneCorreoUtil(email: string | null | undefined): boolean {
  return typeof email === 'string' && FORMA_DE_CORREO.test(email.trim());
}

export interface FichaParaCorreo {
  id: string;
  email: string | null | undefined;
}

export interface ResumenSinCorreo {
  /** Los ids de las que no pueden entrar a la app. */
  ids: Set<string>;
  /** Cuántas fichas viven en el estudio ahora (el denominador). */
  conEstado: number;
  /** ¿Merece un aviso? */
  avisar: boolean;
}

/**
 * `estadoDe` devuelve el estado de la ficha (el mismo cálculo que el chip de la
 * lista) o `undefined` si aún no se sabe: sin estado no se cuenta, porque
 * contarla de más es peor que esperar a que carguen los datos.
 */
export function resumenSinCorreo(
  fichas: readonly FichaParaCorreo[],
  estadoDe: (id: string) => string | undefined,
): ResumenSinCorreo {
  const viven = new Set<string>(ESTADOS_QUE_NECESITAN_CORREO);
  const ids = new Set<string>();
  let conEstado = 0;
  for (const f of fichas) {
    const e = estadoDe(f.id);
    if (!e || !viven.has(e)) continue;
    conEstado += 1;
    if (!tieneCorreoUtil(f.email)) ids.add(f.id);
  }
  const n = ids.size;
  const avisar = n >= 1 && (n >= MINIMO_AVISO_SIN_CORREO || n / conEstado >= FRACCION_AVISO_SIN_CORREO);
  return { ids, conEstado, avisar };
}

/** «1 alumna» / «12 alumnas». */
export const alumnas = (n: number) => `${n} ${n === 1 ? 'alumna' : 'alumnas'}`;

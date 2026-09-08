// Cómo llama cada estudio a su moneda de fidelización.
//
// Sin imports ni `@/` a propósito: así se puede cargar con `node --test`, que
// no resuelve el alias (varios tests de este repo dejaron de ejecutarse en
// silencio por eso). La regla es minúscula pero la usan las dos apps y el
// respaldo tiene que ser EL MISMO en todas — si el panel dice «puntos» y el
// portal «créditos», la clienta cree que son dos cosas.

/** Lo que dice el producto cuando el estudio no ha elegido nada. */
export const NOMBRE_CREDITOS_POR_DEFECTO = 'créditos';

/**
 * Máximo razonable. No es una regla de negocio: es que este texto se pinta
 * dentro de tarjetas estrechas («500 X»), y un nombre largo no se corta —
 * empuja el precio fuera de la tarjeta. Se recorta al guardar, no al pintar,
 * para que lo que se ve sea lo que hay guardado.
 */
export const NOMBRE_CREDITOS_MAX = 24;

/**
 * El nombre en plural, listo para pintar. Siempre devuelve algo.
 *
 * ⚠️ Solo plural. Todos los textos que lo usan hoy son plurales («500 créditos»,
 * «Canjea tus créditos»), y guardar además el singular obligaría a mantener dos
 * campos que casi nadie rellenaría bien. Si algún día hace falta un «1 crédito»,
 * ese es el momento de añadirlo — no antes.
 */
export function nombreCreditos(valor: string | null | undefined): string {
  const limpio = (valor ?? '').trim();
  return limpio === '' ? NOMBRE_CREDITOS_POR_DEFECTO : limpio;
}

/** Normaliza lo que teclea el estudio antes de guardarlo. `null` = usa el por defecto. */
export function normalizarNombreCreditos(valor: string): string | null {
  const limpio = valor.trim().slice(0, NOMBRE_CREDITOS_MAX).trim();
  // Guardar literalmente «créditos» y guardar nada es lo mismo: se guarda nada,
  // para que un cambio futuro del respaldo alcance también a quien lo tecleó.
  if (limpio === '' || limpio.toLowerCase() === NOMBRE_CREDITOS_POR_DEFECTO) return null;
  return limpio;
}

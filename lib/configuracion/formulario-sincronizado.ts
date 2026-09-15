// ─────────────────────────────────────────────────────────────────────────────
// Un formulario de Configuración que copia `studio` en su estado local, sin
// perder lo que la propietaria está escribiendo.
//
// Los formularios de Estudio se volvían a copiar ENTEROS cada vez que `studio`
// cambiaba de referencia, y `updateStudio` crea siempre un objeto nuevo. Así que
// cualquier guardado —elegir el IVA, pegar el logo, guardar la política de
// devoluciones, o el tour marcándose como visto en segundo plano— reiniciaba
// los campos de al lado: el NIF a medio escribir, los datos SEPA, los términos.
//
// #2020 lo cerró en Reservas comparando en JSON la parte que ese formulario
// edita y reiniciándola solo si había cambiado. Aquí es la misma idea, campo a
// campo: un campo se pone al día con el servidor SOLO si la propietaria no lo
// ha tocado desde la última vez que se sincronizó o se guardó (la `base`).
//
// Puro y sin `@/`: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

function igual(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/** Los campos en los que lo que hay en pantalla difiere de la base. */
export function camposEditados<T extends object>(form: T, base: T): (keyof T)[] {
  return (Object.keys(form) as (keyof T)[]).filter(k => !igual(form[k], base[k]));
}

/** ¿Queda algo sin guardar? */
export function hayCambios<T extends object>(form: T, base: T): boolean {
  return camposEditados(form, base).length > 0;
}

/**
 * Llega un valor nuevo del servidor (`servidor`). Lo que la propietaria ha
 * editado respecto a `base` se queda como está; todo lo demás se pone al día.
 *
 * Sirve para los dos momentos en que eso pasa:
 *  - `studio` cambia de referencia → `sincronizarFormulario(form, baseAnterior, studioToForm(studio))`
 *    y la base pasa a ser ese valor del servidor.
 *  - un guardado se confirma → `sincronizarFormulario(form, loEnviado, loGuardado)`:
 *    lo que se tecleó MIENTRAS se guardaba no se pisa, y lo guardado se
 *    normaliza (recortes, vacío → NULL) sin dejar la barra de «sin guardar».
 */
export function sincronizarFormulario<T extends object>(form: T, base: T, servidor: T): T {
  const resultado = { ...servidor };
  for (const k of camposEditados(form, base)) resultado[k] = form[k];
  return resultado;
}

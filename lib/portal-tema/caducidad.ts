// La fecha de salida del portal en React, escrita donde algo la comprueba.
//
// `studios.portal_react` nació con un comentario que dice «ESTA COLUMNA TIENE
// FECHA DE CADUCIDAD»... sin ninguna fecha. Y `portal-shell.tsx` avisa de «no
// dejar que eche raíces» sin decir hasta cuándo. Las dos frases son intención,
// no plazo: nada falla nunca por incumplirlas, y ese es exactamente el
// mecanismo por el que un flag temporal se queda para siempre y acabamos
// manteniendo dos portales.
//
// Lo que convierte una intención en un plazo es que algo se ponga rojo. De eso
// se encarga `caducidad.test.ts`.

/**
 * A partir de este día, la suite falla mientras siga existiendo el flag.
 *
 * ⚠️ **Mover esta fecha es una decisión, no un arreglo.** Es legítimo —el
 * despliegue por fases puede necesitar más tiempo del previsto—, pero se hace
 * a propósito y dejando escrito por qué, no para poner la CI en verde. Si se
 * mueve dos veces seguidas sin motivo, el plazo ya no existe.
 *
 * Elegida el 2026-08-13, cuando el piloto todavía no había empezado (0 de 13
 * estudios con la bandera encendida) y quedaban dos piezas por cerrar: el
 * selector de plaza del kit y la retirada de las cuatro vistas viejas.
 */
export const FECHA_SALIDA_PORTAL_REACT = '2026-10-15';

/**
 * Qué hay que borrar ese día, para que quien se encuentre el fallo no tenga
 * que reconstruirlo. Es la lista del punto 6 y del punto 8 de
 * `themes/RETOMAR.md`, junta.
 */
export const LO_QUE_SE_RETIRA = [
  'la columna `studios.portal_react` y todo lo que la lee',
  'la rama `portalReact && …` de `components/portal/portal-shell.tsx`',
  'las cuatro vistas viejas: portal-home-view, portal-clases-view, portal-bonos-view, bloque-home-render',
  'la ruta de mirar temas `app/portal-tema-preview/`',
] as const;

/** `true` si la fecha de salida ya pasó (comparación en UTC, sin hora). */
export function haCaducado(hoy: Date, fecha = FECHA_SALIDA_PORTAL_REACT): boolean {
  return hoy.toISOString().slice(0, 10) > fecha;
}

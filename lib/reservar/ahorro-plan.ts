// El «Ahorra un 20 %» de las tarjetas de bonos.
//
// ⚠️ Va aparte y con tests porque es la única cifra de esa sección que puede
// MENTIR. El precio y el número de clases los escribe la propietaria; el ahorro
// lo calculamos nosotros, y un porcentaje inventado en pantalla es
// exactamente el error que este repo ya cometió una vez («Compatibilidad 87 %»
// que salía de un `clamp` sobre una heurística fija).

export interface PlanParaAhorro {
  precio: number;
  /** Clases que incluye. `null` = no es un bono por sesiones. */
  sesiones?: number | null;
}

/**
 * Cuánto se ahorra frente a comprar las clases sueltas, en porcentaje entero.
 *
 * Devuelve `null` —y entonces **no se pinta nada**— siempre que la comparación
 * no signifique algo:
 *
 * · sin precio de clase suelta no hay contra qué comparar. Es el caso más
 *   común: un estudio que solo vende bonos. Inventar una referencia sería
 *   fabricar el ahorro entero.
 * · un bono sin sesiones (una mensualidad) no tiene precio por clase.
 * · si no se ahorra nada, o sale más caro, no hay nada que presumir. Un
 *   «Ahorra un 0 %» es peor que el silencio, y un ahorro negativo sería una
 *   mentira directa.
 *
 * Se REDONDEA HACIA ABAJO: prometer un 20 % cuando son 19,6 es prometer de más,
 * y es el tipo de cifra que alguien comprueba con la calculadora.
 */
export function ahorroPorcentaje(
  plan: PlanParaAhorro,
  precioClaseSuelta: number | null | undefined,
): number | null {
  if (!precioClaseSuelta || precioClaseSuelta <= 0) return null;
  if (!plan.sesiones || plan.sesiones <= 0) return null;
  if (plan.precio <= 0) return null;

  const porClase = plan.precio / plan.sesiones;
  // ⚠️ El `+ 1e-9` no es paranoia: `1 - 16/20` da 0.19999999999999996 en coma
  // flotante, así que un bono de 10 clases a 160 € frente a 20 € sueltas —un
  // 20 % exacto, y el ejemplo más redondo que existe— se anunciaba como 19 %.
  // El épsilon absorbe ese error sin dejar que un 19,6 real se convierta en 20:
  // sigue redondeando hacia abajo, que es lo que impide prometer de más.
  const ahorro = Math.floor((1 - porClase / precioClaseSuelta) * 100 + 1e-9);
  return ahorro > 0 ? ahorro : null;
}

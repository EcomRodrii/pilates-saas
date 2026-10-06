// Cuándo la «isla» de la landing (la barra flotante de cristal) se encoge y
// cuándo se alarga. Puro y sin DOM para poder probarlo sin navegador.
//
// Reglas (estilo de las barras de los sitios de producto):
//  · cerca del tope, SIEMPRE completa;
//  · al BAJAR se encoge, pero solo tras un recorrido acumulado (no por un
//    temblor de la rueda o del dedo);
//  · al SUBIR se alarga antes, con un recorrido menor: quien sube suele buscar
//    el menú, así que se le da pronto;
//  · el recorrido se acumula en una dirección y se descarta al cambiar de
//    sentido. Es la histéresis: sin ella, el límite entre «corta» y «larga»
//    parpadearía con cada píxel.
// El oyente real (components/landing/use-isla-compacta.ts) llama a esto desde
// un requestAnimationFrame y solo toca el DOM cuando el estado CAMBIA.

/** Por encima de esta posición (px) la isla está siempre completa. */
export const TOPE_COMPLETA = 80;
/** Cuánto hay que bajar seguido (px) para que se encoja. */
export const UMBRAL_BAJAR = 28;
/** Cuánto hay que subir seguido (px) para que se alargue. */
export const UMBRAL_SUBIR = 10;

export interface EstadoIsla {
  compacta: boolean;
  /** Última posición de scroll vista. */
  y: number;
  /** Recorrido acumulado en la dirección actual (+ bajando, − subiendo). */
  acumulado: number;
}

export const ESTADO_INICIAL: EstadoIsla = { compacta: false, y: 0, acumulado: 0 };

export function siguienteEstado(previo: EstadoIsla, y: number): EstadoIsla {
  // El rebote elástico de iOS da posiciones negativas: cuenta como el tope.
  const pos = Math.max(0, y);
  if (pos <= TOPE_COMPLETA) return { compacta: false, y: pos, acumulado: 0 };

  const delta = pos - previo.y;
  if (delta === 0) return { ...previo, y: pos };

  // Cambio de sentido: el recorrido anterior ya no cuenta.
  const mismoSentido = Math.sign(delta) === Math.sign(previo.acumulado) || previo.acumulado === 0;
  const acumulado = (mismoSentido ? previo.acumulado : 0) + delta;

  let compacta = previo.compacta;
  if (acumulado >= UMBRAL_BAJAR) compacta = true;
  else if (acumulado <= -UMBRAL_SUBIR) compacta = false;

  return { compacta, y: pos, acumulado };
}

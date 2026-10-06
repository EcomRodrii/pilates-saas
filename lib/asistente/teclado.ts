// El chat del asistente con el teclado del móvil abierto. Puro: se prueba con
// `node --test` (teclado.test.ts); lo usa components/asistente/vista-chat.tsx.
//
// En Safari de iOS el teclado NO encoge el viewport de diseño: encoge el
// VISUAL (`window.visualViewport`) y lo desplaza para que se vea el campo. Un
// `position: fixed` se sigue midiendo contra el de diseño, así que el chat
// quedaba con el campo tapado o la página corrida, y al cerrar el teclado no
// siempre volvía a su sitio. Con el teclado abierto, el chat se coloca justo
// sobre lo visible: arriba donde empieza lo visible y tan alto como lo visible,
// con el campo pegado al teclado (como en ChatGPT o Claude en el móvil).

/** Por debajo de esto, la diferencia es la barra de Safari que se esconde, no un teclado. */
export const UMBRAL_TECLADO_PX = 120;

export interface MedidasViewport {
  /** `window.innerHeight`: el viewport de diseño. */
  alto: number;
  /** `visualViewport.height`. */
  altoVisible: number;
  /** `visualViewport.offsetTop`. */
  desplazamiento: number;
}

/** Dónde va el chat con el teclado abierto (px), o `null` si no hay teclado. */
export function areaConTeclado(m: MedidasViewport | null): { top: number; height: number } | null {
  if (!m || !(m.alto > 0) || !(m.altoVisible > 0)) return null;
  if (m.alto - m.altoVisible < UMBRAL_TECLADO_PX) return null;
  return { top: Math.max(0, Math.round(m.desplazamiento)), height: Math.round(m.altoVisible) };
}

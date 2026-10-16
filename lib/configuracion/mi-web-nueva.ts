// «Tu app» y «Tu web» dentro de Configuración (MI_WEB_NUEVA, 16-oct-2026). El fundador: la app de la
// alumna y los widgets de su web van SOLO en Configuración (no en el menú principal) y por separado,
// cada uno con lo suyo y en este orden: primero «Tu app» (cómo se ve, qué enseña y dónde se descarga),
// luego «Tu web» (la dirección, los widgets y ocultar la página) y después Tentare Network.
//
// No mueve datos: las secciones, sus tarjetas y sus direcciones (`?tab=marca`, `?tab=web`,
// `?abrir=contenido-de-tu-app`…) son las de siempre, para que ningún enlace se rompa. Cambia cómo se
// presentan: el nombre de las dos secciones y en cuál se pinta «Contenido de tu app». Con el
// interruptor apagado, todo como antes. Puro, sin `@/`.

import type { HerramientaId, SeccionId } from './secciones.ts';

export const PRESENTACION_MI_WEB: Partial<Record<SeccionId, { titulo: string; resumen: string; frase: string }>> = {
  marca: {
    titulo: 'Tu app', resumen: 'Cómo se ve, qué enseña y dónde se descarga',
    frase: 'La app de tus alumnas: cómo se ve, qué enseña, tu logo y tus textos, y su app en la App Store.',
  },
  web: {
    titulo: 'Tu web', resumen: 'Tu dirección, tus widgets y ocultar tu página',
    frase: 'Tu página de reservas y lo que pones en tu propia web: la dirección, los widgets y ocultarla mientras la preparas.',
  },
};

/** La sección con el nombre que se enseña (con el interruptor, «Tu app» / «Tu web»). */
export function presentarSeccion<T extends { id: SeccionId; titulo: string; resumen?: string; frase?: string }>(s: T, miWebNueva: boolean): T {
  const p = miWebNueva ? PRESENTACION_MI_WEB[s.id] : undefined;
  return p ? { ...s, ...p } : s;
}

/**
 * La sección a la que «pertenece» una herramienta a ojos de quien la abre: «Contenido de tu app» vive en
 * los datos dentro de `web`, pero con el interruptor se pinta en «Tu app», así que su «← Volver» y la
 * columna de la izquierda dicen «Tu app».
 */
export function seccionVisual(seccion: SeccionId, herramienta: HerramientaId | null, miWebNueva: boolean): SeccionId {
  return miWebNueva && herramienta === 'contenido-de-tu-app' ? 'marca' : seccion;
}

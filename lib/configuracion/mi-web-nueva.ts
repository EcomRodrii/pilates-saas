// «Mi app» y «Mi web» dentro de Configuración (MI_WEB_NUEVA, 16-oct-2026). El fundador: la app de la
// alumna y los widgets de su web van SOLO en Configuración (no en el menú principal) y por separado,
// cada uno con lo suyo y en este orden: primero «Mi app» (cómo se ve, qué enseña y dónde se descarga),
// luego «Mi web» (la dirección, los widgets y ocultar la página) y después Tentare Network.
//
// No mueve datos: las secciones, sus tarjetas y sus direcciones (`?tab=marca`, `?tab=web`,
// `?abrir=contenido-de-tu-app`…) son las de siempre, para que ningún enlace se rompa. Cambia cómo se
// presentan: el nombre de las dos secciones y en cuál se pinta «Contenido de tu app». Con el
// interruptor apagado, todo como antes. Puro, sin `@/`.

import type { HerramientaId, SeccionId } from './secciones.ts';

// Y SEPARADAS (fundador, 16-oct por la tarde: «antes ponía MI APP / MI WEB y ahora todo está junto y se
// ve mal», opción A): no un grupo «Tu app y tu web» con dos filas, sino dos grupos, «Mi app» y «Mi web»,
// cada uno con su entrada en la columna y su tarjeta en la portada.
const GRUPO_JUNTO = 'tu-app-y-tu-web';
const GRUPOS_SEPARADOS = [
  { id: 'mi-app', titulo: 'Mi app', frase: 'La app de tus alumnas: cómo se ve, qué enseña y dónde se descarga.', secciones: ['marca'] },
  { id: 'mi-web', titulo: 'Mi web', frase: 'Tu página de reservas y lo que pones en tu propia web.', secciones: ['web'] },
] as const;

/** Los grupos del panel nuevo: con el interruptor, «Tu app y tu web» se parte en «Mi app» y «Mi web». */
export function gruposConMiWeb<G extends { id: string; titulo: string; frase: string; secciones: readonly SeccionId[] }>(
  grupos: readonly G[], miWebNueva: boolean,
): G[] {
  if (!miWebNueva) return [...grupos];
  return grupos.flatMap(g => (g.id === GRUPO_JUNTO
    ? GRUPOS_SEPARADOS.map(s => ({ ...g, ...s, secciones: [...s.secciones] }) as G)
    : [g]));
}

/** ¿El grupo es solo esa sección y se llama igual? Entonces no se repite el nombre (encabezado, antetítulo). */
export function grupoEsLaSeccion(grupo: { titulo: string; secciones: readonly SeccionId[] }, seccion: { titulo: string }): boolean {
  return grupo.secciones.length === 1 && grupo.titulo === seccion.titulo;
}

export const PRESENTACION_MI_WEB: Partial<Record<SeccionId, { titulo: string; resumen: string; frase: string }>> = {
  marca: {
    titulo: 'Mi app', resumen: 'Cómo se ve, qué enseña y dónde se descarga',
    frase: 'La app de tus alumnas: cómo se ve, qué enseña, tu logo y tus textos, y su app en la App Store.',
  },
  web: {
    titulo: 'Mi web', resumen: 'Tu dirección, tus widgets y ocultar tu página',
    frase: 'Tu página de reservas y lo que pones en tu propia web: la dirección, los widgets y ocultarla mientras la preparas.',
  },
};

/** La sección con el nombre que se enseña (con el interruptor, «Mi app» / «Mi web»). */
export function presentarSeccion<T extends { id: SeccionId; titulo: string; resumen?: string; frase?: string }>(s: T, miWebNueva: boolean): T {
  const p = miWebNueva ? PRESENTACION_MI_WEB[s.id] : undefined;
  return p ? { ...s, ...p } : s;
}

/**
 * La sección a la que «pertenece» una herramienta a ojos de quien la abre: «Contenido de tu app» vive en
 * los datos dentro de `web`, pero con el interruptor se pinta en «Mi app», así que su «← Volver» y la
 * columna de la izquierda dicen «Mi app».
 */
export function seccionVisual(seccion: SeccionId, herramienta: HerramientaId | null, miWebNueva: boolean): SeccionId {
  return miWebNueva && herramienta === 'contenido-de-tu-app' ? 'marca' : seccion;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de transición del panel, para `transitionTypes` de <Link> y router.push.
//
// Solo se anima lo que va MARCADO. Las navegaciones de Next ya son transiciones
// de React, pero también lo es cualquier `startTransition` de una pantalla
// (filtrar, buscar): si el contenido se animara ante cualquier transición, el
// panel parpadearía al escribir en un buscador. Por eso el tipo se pone a mano
// solo donde se cambia de sección: el menú (escritorio, barra inferior y «Más»)
// y el buscador ⌘K. Los enlaces de dentro de una pantalla cambian sin animación,
// a propósito: ahí manda la velocidad.
// ─────────────────────────────────────────────────────────────────────────────

export const TIPO_SECCION = 'panel-seccion';
export const TRANSICION_SECCION: string[] = [TIPO_SECCION];

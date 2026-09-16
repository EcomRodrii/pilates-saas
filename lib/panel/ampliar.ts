'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «Ampliar a toda la pantalla», para cualquier pantalla del panel.
//
// Nació en el Calendario (#2130/#2133) y se generaliza aquí tal cual funcionaba:
// ampliar NO mueve la pantalla de sitio, le pide al panel que esconda menú y barra
// superior (`data-panel-ampliado` en <html>, reglas en globals.css) y el contenido
// crece solo. Un solo estado para todo el panel, fuera de React: el botón vive en
// PageHeader y quien lo vuelve a apagar (Escape, cambiar de pantalla) en el
// armazón, y los dos tienen que ver lo mismo.
//
// ⚠️ La pantalla completa del navegador (`requestFullscreen`) NO sirve: solo
// enseña el elemento ampliado, y los diálogos y hojas se pintan en un portal
// fuera de él — se abrían invisibles.
// ─────────────────────────────────────────────────────────────────────────────

import { flushSync } from 'react-dom';
import { EVENTO_MEDIR_ALTO } from '@/lib/hooks/use-alto-hasta-el-fondo';

/** Pantallas con botón de ampliar: las de trabajo con mucha superficie. Ruta exacta. */
export const PANTALLAS_AMPLIABLES: readonly string[] = [
  '/calendario', '/clientas', '/cobros', '/informes', '/mensajeria', '/equipo',
];

let ampliado = false;
const oyentes = new Set<() => void>();

export function suscribirAmpliado(avisar: () => void): () => void {
  oyentes.add(avisar);
  return () => { oyentes.delete(avisar); };
}
export const estadoAmpliado = (): boolean => ampliado;
export const estadoAmpliadoServidor = (): boolean => false;

function fijar(siguiente: boolean) {
  ampliado = siguiente;
  document.documentElement.toggleAttribute('data-panel-ampliado', siguiente);
  for (const avisar of oyentes) avisar();
}

/**
 * Ampliar o volver, animado con View Transitions: el navegador hace una foto
 * antes y otra después y las funde; la pantalla viaja a su sitio y el menú y la
 * barra se retiran hacia fuera (curvas en globals.css, «Ampliar y reducir»).
 *
 * ⚠️ Todo tiene que quedar puesto ANTES de que acabe el callback, porque ahí se
 * toma la foto del estado nuevo: por eso `flushSync` (el icono del botón) y la
 * medida inmediata del alto (`EVENTO_MEDIR_ALTO`, la rejilla del Calendario).
 * Con la medida normal, un fotograma después, la animación llegaba al tamaño
 * viejo y luego pegaba un salto.
 *
 * `animar: false` para apagarlo al cambiar de pantalla: ahí no hay nada que
 * animar y una transición encima de la navegación se pisaría con la suya.
 */
export function cambiarAmpliado(siguiente: boolean, { animar = true }: { animar?: boolean } = {}): void {
  if (typeof document === 'undefined' || siguiente === ampliado) return;
  const aplicar = () => {
    flushSync(() => fijar(siguiente));
    window.dispatchEvent(new Event(EVENTO_MEDIR_ALTO));
  };
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  if (!animar || !doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    aplicar();
    return;
  }
  const raiz = document.documentElement;
  raiz.setAttribute('data-vt-ampliar', siguiente ? 'ampliar' : 'reducir');
  const transicion = doc.startViewTransition(aplicar);
  transicion.finished.finally(() => raiz.removeAttribute('data-vt-ampliar'));
}

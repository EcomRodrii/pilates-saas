import { useEffect, useState } from 'react';
import type { BloqueHome, PantallaId } from '@/lib/portal-home-bloques';

// Puente postMessage entre el editor (theme-workspace.tsx → HomePreview,
// padre) y esta ruta /portal-preview (hijo, dentro de un iframe). Antes solo
// existía el sentido padre→hijo (el borrador de bloques); esto añade el
// sentido inverso — clicar un bloque AQUÍ selecciona su fila en el panel
// izquierdo del editor — sin tocar BloqueHomeRender ni las vistas del portal
// más que con el `data-bloque-id` que ya llevan.

/**
 * Escucha el borrador de bloques (y la selección activa) que manda
 * `HomePreview` para UNA pantalla. Mismo protocolo que antes
 * (`tentare-bloques-preview`, filtrado por `pantalla`), ahora también lee
 * `seleccionId` del mismo mensaje.
 */
export function usePreviewBloques(pantalla: PantallaId): { bloques: BloqueHome[] | null; seleccionId: string | null } {
  const [bloques, setBloques] = useState<BloqueHome[] | null>(null);
  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  useEffect(() => {
    if (window.self === window.top) return; // solo dentro de un iframe
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; pantalla?: string; bloques?: unknown; seleccionId?: string | null } | null;
      if (!d || d.type !== 'tentare-bloques-preview' || d.pantalla !== pantalla) return;
      if (Array.isArray(d.bloques)) setBloques(d.bloques as BloqueHome[]);
      setSeleccionId(d.seleccionId ?? null);
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [pantalla]);
  return { bloques, seleccionId };
}

/**
 * Clicar un bloque del catálogo (marcado con `data-bloque-id`, ver
 * portal-*-view.tsx) manda su id al padre en vez de navegar — captura en
 * fase de captura para interceptar el click ANTES que el `<Link>`/`<a>` de
 * dentro del bloque. Los bloques `sistema` no llevan `data-bloque-id`, así
 * que un click ahí no encuentra `closest()` y navega con normalidad — el
 * editor solo permite seleccionar bloques del catálogo, no módulos fijos.
 */
export function usePreviewClickToSelect(): void {
  useEffect(() => {
    if (window.self === window.top) return;
    function onClick(e: MouseEvent) {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-bloque-id]');
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      window.parent.postMessage({ type: 'tentare-bloques-preview-click', bloqueId: el.dataset.bloqueId }, window.location.origin);
    }
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);
}

/** Resalta con un contorno el bloque cuyo `data-bloque-id` coincide con la selección activa del editor. */
export function usePreviewResaltado(seleccionId: string | null): void {
  useEffect(() => {
    const anterior = document.querySelector<HTMLElement>('[data-bloque-id].tentare-preview-seleccionado');
    anterior?.classList.remove('tentare-preview-seleccionado');
    if (!seleccionId) return;
    const el = document.querySelector<HTMLElement>(`[data-bloque-id="${seleccionId}"]`);
    el?.classList.add('tentare-preview-seleccionado');
  }, [seleccionId]);
}

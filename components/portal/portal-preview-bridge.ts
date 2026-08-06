import { useEffect, useState } from 'react';
import type { BloqueHome, PantallaId } from '@/lib/portal-home-bloques';

/**
 * Qué hace un click dentro del preview: `editar` lo selecciona en el panel
 * del editor, `navegar` deja que el portal se comporte como el de la socia.
 */
export type ModoPreview = 'editar' | 'navegar';

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
export function usePreviewBloques(pantalla: PantallaId): { bloques: BloqueHome[] | null; seleccionId: string | null; modo: ModoPreview } {
  const [bloques, setBloques] = useState<BloqueHome[] | null>(null);
  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  // Por defecto 'editar': es lo que hacía antes de existir el interruptor, y
  // así el primer click no navega por accidente si llega antes del mensaje.
  const [modo, setModo] = useState<ModoPreview>('editar');
  useEffect(() => {
    if (window.self === window.top) return; // solo dentro de un iframe
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; pantalla?: string; bloques?: unknown; seleccionId?: string | null; modo?: string } | null;
      if (!d || d.type !== 'tentare-bloques-preview' || d.pantalla !== pantalla) return;
      if (Array.isArray(d.bloques)) setBloques(d.bloques as BloqueHome[]);
      setSeleccionId(d.seleccionId ?? null);
      if (d.modo === 'editar' || d.modo === 'navegar') setModo(d.modo);
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [pantalla]);
  return { bloques, seleccionId, modo };
}

/**
 * Clicar un bloque (marcado con `data-bloque-id`, ver portal-*-view.tsx)
 * manda su id al padre en vez de navegar — en fase de captura, para
 * interceptar el click ANTES que el `<Link>`/`<a>` de dentro del bloque.
 *
 * ⚠️ **Por qué hace falta el modo.** Antes solo los bloques del catálogo
 * llevaban `data-bloque-id`, así que un click sobre un módulo fijo no
 * encontraba `closest()` y navegaba con normalidad. Ahora los `sistema`
 * también son seleccionables, y eso se come la navegación: clicar "Reservas"
 * dentro del preview seleccionaría el bloque en vez de abrir Reservas. Es lo
 * que hace Shopify, pero es un cambio de comportamiento — así que la
 * propietaria lo controla con un interruptor explícito en la barra superior,
 * en vez de perder la navegación sin saber por qué.
 */
export function usePreviewClickToSelect(modo: ModoPreview = 'editar'): void {
  useEffect(() => {
    if (window.self === window.top) return;
    if (modo !== 'editar') return; // en 'navegar' el preview se usa como el portal real
    function onClick(e: MouseEvent) {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-bloque-id]');
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      window.parent.postMessage({ type: 'tentare-bloques-preview-click', bloqueId: el.dataset.bloqueId }, window.location.origin);
    }
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, [modo]);
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

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { BloqueHome, PantallaId } from '@/lib/portal-home-bloques';

/**
 * Construye un enlace INTERNO del portal, consciente de si está montado en
 * el árbol real (`/portal/[slug]`) o dentro del editor de temas
 * (`/portal-preview/[slug]`) — mismo componente compartido en los dos.
 *
 * `ruta` es la parte que va DESPUÉS de `/portal`/`/portal-preview`, p.ej.
 * `/${slug}/clases`. Se usa así en vez de con `/portal` a pelo porque, antes
 * de esto, clicar cualquier enlace del portal DENTRO del preview del editor
 * sacaba a la "socia de mentira" fuera del árbol `/portal-preview` —que no
 * lleva sesión a propósito— y aterrizaba en el portal real, que la mandaba a
 * `/login` sin salida: el callejón que reportó el fundador (2026-08-19), "no
 * puedo navegar / no puedo volver atrás / páginas que dejan de funcionar".
 *
 * ⚠️ Dentro del preview, además, hay que REPETIR el token de la URL actual en
 * cada enlace: cada pantalla de `/portal-preview/[slug]/*` valida su propio
 * `?t=` en el servidor (`tokenPreviewValido`, por segmento, no solo en el
 * primer salto) — sin arrastrarlo, la primera vez que se navegara DENTRO del
 * iframe caería igual en el placeholder "Recarga la vista previa", solo que
 * por un motivo distinto (token ausente en vez de portal real sin sesión).
 * Se relee de la propia URL (no de una prop): es el mismo token que ya
 * validó ESTA carga, así que sigue siendo válido para la siguiente mientras
 * dure la sesión de edición.
 *
 * Se deriva de la URL, no de una prop: así funciona igual en cualquier
 * componente compartido entre los dos árboles (`portal-home-view.tsx`,
 * `bloque-home-render.tsx`, `portal-nav.tsx`) sin enhebrar un prop nuevo por
 * cada capa — el mismo criterio que ya usa `useStudio()` para resolver el
 * estudio en ambos árboles.
 */
export function usePortalHref(): (ruta: string) => string {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const enPreview = pathname.startsWith('/portal-preview/');
  const token = enPreview ? searchParams?.get('t') ?? '' : '';
  return (ruta: string) => {
    if (!enPreview) return `/portal${ruta}`;
    // ⚠️ Inicio vive en la RAÍZ dentro de `/portal-preview` (`page.tsx` del
    // slug, sin sub-ruta) — a diferencia del portal real, donde Inicio SÍ es
    // `/portal/[slug]/home`. `app/portal-preview/[slug]/home/` no existe.
    // Quien construye un enlace a Inicio con la misma forma que usaría para
    // el portal real (`/${slug}/home`, que es justo lo que hace la barra de
    // navegación con `NAV_DEFAULT`) aterrizaría en un 404 dentro del
    // preview — medido: la pestaña «Inicio» clicada desde Bonos rompía así.
    // Se normaliza aquí, en el único sitio que construye URLs de preview, en
    // vez de en cada llamador: cualquier enlace futuro a Inicio queda a
    // salvo del mismo bache sin tener que saberlo.
    const rutaNormalizada = ruta.endsWith('/home') ? ruta.slice(0, -'/home'.length) : ruta;
    return `/portal-preview${rutaNormalizada}${token ? `?t=${encodeURIComponent(token)}` : ''}`;
  };
}

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

/**
 * Mide dónde está cada bloque y se lo manda al padre, para que pinte el
 * overlay (la etiqueta y el "+" de insertar) FUERA del iframe — ver
 * lib/theme/overlay-preview.ts para el porqué.
 *
 * ⚠️ Se remide en scroll y en resize, y también cuando el DOM cambia: el
 * borrador llega por postMessage y repinta los bloques sin que medie ninguna
 * de las dos cosas. Sin el observador, añadir una sección dejaría todos los
 * "+" en el sitio de antes.
 *
 * Las medidas van en el sistema del iframe (viewport interno, sin escalar):
 * escalar aquí y otra vez en el padre es el bug clásico de esta conversión.
 */
export function usePreviewMedidas(activo: boolean): void {
  useEffect(() => {
    if (window.self === window.top || !activo) return;

    let pendiente = 0;
    function medir() {
      const bloques = [...document.querySelectorAll<HTMLElement>('[data-bloque-id]')].map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.dataset.bloqueId!, caja: { x: r.left, y: r.top, ancho: r.width, alto: r.height } };
      });
      window.parent.postMessage({ type: 'tentare-bloques-preview-medidas', bloques }, window.location.origin);
    }
    // Una medida por frame como mucho: el scroll dispara decenas de eventos y
    // cada uno cruza un postMessage.
    function pedirMedida() {
      if (pendiente) return;
      pendiente = requestAnimationFrame(() => { pendiente = 0; medir(); });
    }

    medir();
    window.addEventListener('scroll', pedirMedida, { passive: true, capture: true });
    window.addEventListener('resize', pedirMedida);
    const mo = new MutationObserver(pedirMedida);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden'] });
    return () => {
      if (pendiente) cancelAnimationFrame(pendiente);
      window.removeEventListener('scroll', pedirMedida, { capture: true });
      window.removeEventListener('resize', pedirMedida);
      mo.disconnect();
    };
  }, [activo]);
}

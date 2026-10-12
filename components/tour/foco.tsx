'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Lo que comparten la visita guiada y el tutorial de una pantalla: encontrar en
// la página el control que se está señalando, saber si hay un diálogo de la app
// encima y seguir su posición mientras se hace scroll.
//
// La visita (`visita-guiada.tsx`) conserva su propio `useObjetivo`, que además
// cuenta el tiempo de los pasos «hacer» y avisa a Sentry a su manera: no se
// toca su comportamiento. El tutorial usa `useFoco`, que es lo mismo sin eso.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { selectorCss } from '@/lib/tour/capitulos';
import { MARGEN_SUPERIOR, modoDeDesplazamiento } from '@/lib/tour/desplazar';

/** El primer elemento con ese selector que se VE (la barra de móvil y la de escritorio conviven en el DOM). */
export function elementoVisible(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selectorCss(selector))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/** ¿Hay un diálogo de la app abierto? (los de la visita y el tutorial llevan `data-visita` y no cuentan.) */
export function hayDialogoAbierto(): boolean {
  return !!document.querySelector('[role="dialog"]:not([data-visita]), [role="alertdialog"]:not([data-visita])');
}

export function mismoRect(a: DOMRect | null, b: DOMRect): boolean {
  return !!a && Math.abs(a.top - b.top) < 1 && Math.abs(a.left - b.left) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;
}

/** ¿Pide la persona menos movimiento? (Leído al usarlo: puede cambiarlo con la página abierta.) */
export function prefiereMenosMovimiento(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * Localiza el control y lo sigue (scroll, resize, la página que se recoloca al
 * cargar). `perdido` se enciende si pasado `esperaMs` no aparece: quien lo usa
 * decide qué hacer (el tutorial salta el paso y avisa).
 */
export function useFoco(selector: string | null, esperaMs: number) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [perdido, setPerdido] = useState(false);
  const [dialogo, setDialogo] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Mide el DOM real: el ejemplo canónico de efecto legítimo.
    setRect(null); setPerdido(false);
    if (!selector) return;
    const inicio = Date.now();
    let centrado = false;
    const medir = () => {
      const el = elementoVisible(selector);
      if (el) {
        const r = el.getBoundingClientRect();
        if (!centrado) {
          centrado = true;
          const comportamiento: ScrollBehavior = prefiereMenosMovimiento() ? 'auto' : 'smooth';
          const modo = modoDeDesplazamiento(r, window.innerHeight);
          if (modo === 'centro') el.scrollIntoView({ block: 'center', behavior: comportamiento });
          else if (modo === 'inicio') window.scrollTo({ top: window.scrollY + r.top - MARGEN_SUPERIOR, behavior: comportamiento });
        }
        setRect(prev => (mismoRect(prev, r) ? prev : r));
        setPerdido(false);
      } else if (Date.now() - inicio > esperaMs) {
        setPerdido(true);
      }
      const abierto = hayDialogoAbierto();
      setDialogo(prev => (prev === abierto ? prev : abierto));
    };
    medir();
    const id = window.setInterval(medir, 250);
    let pendiente = 0;
    const alMover = () => { if (!pendiente) pendiente = requestAnimationFrame(() => { pendiente = 0; medir(); }); };
    window.addEventListener('resize', alMover);
    window.addEventListener('scroll', alMover, { capture: true, passive: true });
    return () => {
      window.clearInterval(id); if (pendiente) cancelAnimationFrame(pendiente);
      window.removeEventListener('resize', alMover); window.removeEventListener('scroll', alMover, true);
    };
  }, [selector, esperaMs]);

  return { rect, perdido, dialogo };
}

'use client';

import { useEffect } from 'react';

// Los enlaces a secciones de esta misma página (#precio, #faq, «Ver cómo
// funciona»…) saltaban de golpe. Aquí se deslizan. No se hace con
// `scroll-behavior: smooth` en <html> a propósito: eso vuelve suaves TODOS los
// `scrollTo`, incluidos los que la propia página y los tests usan para
// colocarse al instante. Un solo oyente delegado: no toca el marcado de la
// cabecera (que no cambia) y cubre cualquier ancla nueva. Con
// `prefers-reduced-motion`, el salto de siempre.

export function AnclasSuaves() {
  useEffect(() => {
    const alPulsar = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href^="#"]');
      const id = a?.getAttribute('href')?.slice(1);
      if (!id) return;
      const destino = document.getElementById(decodeURIComponent(id));
      if (!destino) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      e.preventDefault();
      destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.pushState(null, '', `#${id}`);
    };
    document.addEventListener('click', alPulsar);
    return () => document.removeEventListener('click', alPulsar);
  }, []);
  return null;
}

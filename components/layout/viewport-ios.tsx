'use client';

import { useEffect } from 'react';
import { conTopeDeEscala, esIOS } from '@/lib/panel/viewport-ios';

// `maximum-scale=1` en la meta viewport del panel, solo en iOS/iPadOS: el
// porqué, en lib/panel/viewport-ios.ts. Del lado del navegador porque el
// `viewport` de Next es uno por segmento, no por petición, y leer el
// User-Agent en el servidor volvería dinámico todo el panel. Basta tras
// hidratar: el zoom que evita es el de ENFOCAR un campo, y eso solo pasa con
// la página ya viva.
//
// ⚠️ Next pinta la meta viewport en el <head> y puede volver a pintarla al
// navegar; por eso se vigila el <head> y se reaplica (solo si cambió: sin
// bucle). Al salir del panel se deja como estaba.

export function ViewportIOS() {
  useEffect(() => {
    if (!esIOS(navigator.userAgent, navigator.maxTouchPoints ?? 0)) return;
    const originales = new Map<HTMLMetaElement, string>();
    const aplicar = () => {
      for (const meta of Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="viewport"]'))) {
        const actual = meta.getAttribute('content') ?? '';
        const nuevo = conTopeDeEscala(actual);
        if (nuevo === actual) continue;
        if (!originales.has(meta)) originales.set(meta, actual);
        meta.setAttribute('content', nuevo);
      }
    };
    aplicar();
    const vigia = new MutationObserver(aplicar);
    vigia.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['content'] });
    return () => {
      vigia.disconnect();
      for (const [meta, content] of originales) if (meta.isConnected) meta.setAttribute('content', content);
    };
  }, []);
  return null;
}

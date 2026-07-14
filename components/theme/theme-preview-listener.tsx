'use client';

import { useEffect } from 'react';

// Claves de CSS var que el preview puede sobreescribir (whitelist — no se acepta
// cualquier propiedad venida por postMessage).
const CLAVES_PERMITIDAS = new Set([
  '--portal-brand',
  '--portal-brand-foreground',
  '--portal-brand-secondary',
  '--brand',
  '--brand-foreground',
  '--brand-secondary',
  '--accent',
  '--background',
  '--foreground',
  '--radius',
  '--font-sans',
  '--font-heading',
]);

// Se monta en las superficies previsualizables (reservas). Cuando la página se
// carga DENTRO de un iframe (el editor de marca), escucha el tema borrador por
// postMessage y lo aplica en vivo a :root. Fuera de un iframe no hace nada.
export function ThemePreviewListener() {
  useEffect(() => {
    if (window.self === window.top) return; // solo en modo preview (dentro de iframe)
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; vars?: Record<string, unknown> } | null;
      if (!d || d.type !== 'tentare-theme-preview' || typeof d.vars !== 'object' || !d.vars) return;
      for (const [k, v] of Object.entries(d.vars)) {
        if (CLAVES_PERMITIDAS.has(k) && typeof v === 'string') {
          document.documentElement.style.setProperty(k, v);
        }
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  return null;
}

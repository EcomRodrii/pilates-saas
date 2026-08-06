'use client';

import { useEffect } from 'react';

// La whitelist vive en lib/ (módulo puro) para que un test pueda comprobar que
// no se queda corta — ver el comentario de cabecera de ese fichero.
import { CLAVES_PREVIEW_PERMITIDAS as CLAVES_PERMITIDAS } from '@/lib/theme-preview-vars';


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
      // ThemePreview manda el mapa COMPLETO del tema borrador en cada cambio,
      // pero algunas variantes (buttonStyle 'solid', cardStyle 'flat') no
      // declaran ciertas vars a propósito, para heredar el fallback del
      // componente. Sin este borrado previo, cambiar de 'elevada' a 'plana'
      // en el editor dejaría la sombra vieja pegada en el preview: la var ya
      // no llega en el mensaje, pero seguiría puesta en :root desde el
      // mensaje anterior.
      for (const clave of CLAVES_PERMITIDAS) document.documentElement.style.removeProperty(clave);
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

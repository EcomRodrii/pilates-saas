'use client';

import { useEffect } from 'react';

// La whitelist vive en lib/ (módulo puro) para que un test pueda comprobar que
// no se queda corta — ver el comentario de cabecera de ese fichero.
import { varsDePreview, varsKitDePreview } from '@/lib/theme-preview-vars';


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
      // ⚠️ Se ESCRIBEN todas las claves permitidas, las traiga o no el
      // mensaje: las que no vienen se ponen a `initial`. Antes se borraban, y
      // borrar la propiedad de línea descubre la del `<style>` del tema
      // PUBLICADO que pinta el servidor — así que cada tema se previsualizaba
      // sobre los restos del anterior. Ver `varsDePreview`.
      for (const [k, v] of Object.entries(varsDePreview(d.vars))) {
        document.documentElement.style.setProperty(k, v);
      }
      // Los del kit van aparte y con la regla contraria — las ausentes se
      // BORRAN, no se ponen a `initial`. El motivo, en `varsKitDePreview`.
      const kit = varsKitDePreview(d.vars);
      for (const [k, v] of Object.entries(kit.aplicar)) {
        document.documentElement.style.setProperty(k, v);
      }
      for (const k of kit.borrar) document.documentElement.style.removeProperty(k);
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  return null;
}

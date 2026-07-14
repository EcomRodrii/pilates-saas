'use client';

import { useEffect, useRef } from 'react';
import { themeToCssVars } from '@/lib/theme-runtime';
import type { ThemeConfig } from '@/lib/theme-schema';

// Preview en vivo REAL: iframe de la página pública de reservas del estudio, con
// el tema BORRADOR aplicándose en vivo por postMessage (lo recibe
// ThemePreviewListener, montado en la página de reservas). Fiel al 100% porque
// es la página de verdad, no una maqueta.
export function ThemePreview({ config, slug }: { config: ThemeConfig; slug?: string | null }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const vars = themeToCssVars(config) as Record<string, string>;

  function enviar() {
    ref.current?.contentWindow?.postMessage(
      { type: 'tentare-theme-preview', vars },
      window.location.origin,
    );
  }

  // Reenvía el tema en cada cambio (el componente se re-renderiza al editar).
  useEffect(() => {
    enviar();
  });

  if (!slug) {
    return (
      <div className="mx-auto w-full max-w-[320px] aspect-[9/19] rounded-[2rem] border-[6px] border-black/85 bg-muted flex items-center justify-center text-center px-6">
        <p className="text-[12px] text-muted-foreground">La vista previa aparecerá cuando el estudio tenga su enlace de reservas listo.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[320px] aspect-[9/19] rounded-[2rem] border-[6px] border-black/85 shadow-xl overflow-hidden bg-white">
      <iframe
        ref={ref}
        src={`/reservar/${slug}`}
        title="Vista previa del portal"
        onLoad={enviar}
        className="w-full h-full border-0"
      />
    </div>
  );
}

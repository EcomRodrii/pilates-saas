'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchHomePreviewToken } from '@/lib/api-client';
import type { BloqueHome } from '@/lib/portal-home-bloques';

// Preview en vivo REAL del constructor de bloques del Inicio (Fase 4 del
// editor de temas): mismo marco de móvil e iframe que ThemePreview
// (components/theme/theme-preview.tsx), pero apuntando a
// /portal-preview/[slug] (sin sesión, token firmado) y sincronizando el
// borrador de BLOQUES en vez de CSS vars — lo recibe
// PortalPreviewHomeClient vía postMessage.
export function HomePreview({ bloques, slug }: { bloques: BloqueHome[]; slug?: string | null }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchHomePreviewToken().then((t) => { if (vivo) setToken(t); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  function enviar() {
    ref.current?.contentWindow?.postMessage(
      { type: 'tentare-home-preview', bloques },
      window.location.origin,
    );
  }

  // Reenvía el borrador en cada cambio (el componente se re-renderiza al editar).
  useEffect(() => {
    enviar();
  });

  if (!slug || !token) {
    return (
      <div className="mx-auto w-full max-w-[320px] aspect-[9/19] rounded-[2rem] border-[6px] border-black/85 bg-muted flex items-center justify-center text-center px-6">
        <p className="text-[12px] text-muted-foreground">La vista previa aparecerá en un momento.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[320px] aspect-[9/19] rounded-[2rem] border-[6px] border-black/85 shadow-xl overflow-hidden bg-white">
      <iframe
        ref={ref}
        src={`/portal-preview/${slug}?t=${token}`}
        title="Vista previa del Inicio del portal"
        onLoad={enviar}
        className="w-full h-full border-0"
      />
    </div>
  );
}

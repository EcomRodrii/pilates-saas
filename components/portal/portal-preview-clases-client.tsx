'use client';

import { useEffect, useState } from 'react';
import { PortalClasesView } from './portal-clases-view';
import { SESION_MUESTRA } from '@/lib/theme/preview-sesion-muestra';
import type { BloqueHome } from '@/lib/portal-home-bloques';

// Escucha el borrador de bloques en vivo mandado por HomePreview (Fase 1 del
// Theme Builder, generaliza el mecanismo de Home) — mismo protocolo que
// portal-preview-home-client.tsx, filtrando por `pantalla === 'clases'`.
function useBloquesPreviewOverride(): BloqueHome[] | null {
  const [bloques, setBloques] = useState<BloqueHome[] | null>(null);
  useEffect(() => {
    if (window.self === window.top) return; // solo dentro de un iframe
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; pantalla?: string; bloques?: unknown } | null;
      if (!d || d.type !== 'tentare-bloques-preview' || d.pantalla !== 'clases' || !Array.isArray(d.bloques)) return;
      setBloques(d.bloques as BloqueHome[]);
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  return bloques;
}

export function PortalPreviewClasesClient() {
  const override = useBloquesPreviewOverride();
  return <PortalClasesView session={SESION_MUESTRA} escribible={false} bloquesOverride={override ?? undefined} />;
}

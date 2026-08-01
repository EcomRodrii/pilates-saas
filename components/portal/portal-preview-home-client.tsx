'use client';

import { useEffect, useState } from 'react';
import { PortalHomeView } from './portal-home-view';
import { SESION_MUESTRA } from '@/lib/theme/preview-sesion-muestra';
import type { BloqueHome } from '@/lib/portal-home-bloques';

// Sesión de muestra: esta ruta nunca tiene una socia real (ver
// app/portal-preview/[slug]/layout.tsx, sin PortalAuthProvider). Sin
// reservas propias, PortalHomeView cae al estado "Sin clases reservadas" de
// la tarjeta grande — el resto (Esta semana, bloques del catálogo, colores,
// tipografía) es el catálogo REAL del estudio, cargado por useStudio() vía
// StudioSlugGate igual que en /reservar/[slug].

// Escucha el borrador de bloques en vivo mandado por HomePreview (el iframe
// que monta esta ruta, ver components/theme/home-preview.tsx) — mismo
// mecanismo de postMessage que ThemePreview/ThemePreviewListener usan para
// el tema, pero con datos estructurados (BloqueHome[]) en vez de CSS vars.
// HomePreview manda el borrador de LAS TRES pantallas en cada mensaje (con
// `pantalla` para distinguirlas); esta vista solo se queda con el suyo.
function useHomeBloquesPreviewOverride(): BloqueHome[] | null {
  const [bloques, setBloques] = useState<BloqueHome[] | null>(null);
  useEffect(() => {
    if (window.self === window.top) return; // solo dentro de un iframe
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; pantalla?: string; bloques?: unknown } | null;
      if (!d || d.type !== 'tentare-bloques-preview' || d.pantalla !== 'home' || !Array.isArray(d.bloques)) return;
      setBloques(d.bloques as BloqueHome[]);
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  return bloques;
}

export function PortalPreviewHomeClient() {
  const override = useHomeBloquesPreviewOverride();
  return <PortalHomeView session={SESION_MUESTRA} homeBloquesOverride={override ?? undefined} />;
}

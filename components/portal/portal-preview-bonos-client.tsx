'use client';

import { PortalBonosView } from './portal-bonos-view';
import { SESION_MUESTRA } from '@/lib/theme/preview-sesion-muestra';
import { usePreviewBloques, usePreviewClickToSelect, usePreviewResaltado } from './portal-preview-bridge';

// Mismo protocolo que portal-preview-home-client.tsx, filtrando por
// `pantalla === 'bonos'` — ver components/portal/portal-preview-bridge.ts.

export function PortalPreviewBonosClient() {
  const { bloques, seleccionId, modo } = usePreviewBloques('bonos');
  usePreviewClickToSelect(modo);
  usePreviewResaltado(seleccionId);
  return <PortalBonosView session={SESION_MUESTRA} navegar={() => {}} bloquesOverride={bloques ?? undefined} />;
}

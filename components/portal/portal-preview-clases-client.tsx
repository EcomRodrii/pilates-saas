'use client';

import { PortalClasesView } from './portal-clases-view';
import { SESION_MUESTRA } from '@/lib/theme/preview-sesion-muestra';
import { usePreviewBloques, usePreviewClickToSelect, usePreviewResaltado } from './portal-preview-bridge';

// Mismo protocolo que portal-preview-home-client.tsx, filtrando por
// `pantalla === 'clases'` — ver components/portal/portal-preview-bridge.ts.

export function PortalPreviewClasesClient() {
  const { bloques, seleccionId } = usePreviewBloques('clases');
  usePreviewClickToSelect();
  usePreviewResaltado(seleccionId);
  return <PortalClasesView session={SESION_MUESTRA} escribible={false} bloquesOverride={bloques ?? undefined} />;
}

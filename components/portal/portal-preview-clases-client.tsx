'use client';

import { PortalClasesView } from './portal-clases-view';
import { SESION_MUESTRA } from '@/lib/theme/preview-sesion-muestra';
import { usePreviewBloques, usePreviewClickToSelect, usePreviewResaltado, usePreviewMedidas } from './portal-preview-bridge';

// Mismo protocolo que portal-preview-home-client.tsx, filtrando por
// `pantalla === 'clases'` — ver components/portal/portal-preview-bridge.ts.

export function PortalPreviewClasesClient() {
  const { bloques, seleccionId, modo } = usePreviewBloques('clases');
  usePreviewClickToSelect(modo);
  // Solo en modo edición: navegando, el overlay del padre no se pinta.
  usePreviewMedidas(modo === 'editar');
  usePreviewResaltado(seleccionId);
  return <PortalClasesView session={SESION_MUESTRA} escribible={false} bloquesOverride={bloques ?? undefined} />;
}

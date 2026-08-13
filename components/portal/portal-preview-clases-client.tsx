'use client';

import { PortalClasesView } from './portal-clases-view';
import { SESION_MUESTRA } from '@/lib/theme/preview-sesion-muestra';
import { usePreviewBloques, usePreviewClickToSelect, usePreviewResaltado, usePreviewMedidas } from './portal-preview-bridge';
import { useVistaPreviaKit } from './vista-previa-kit';

// Mismo protocolo que portal-preview-home-client.tsx, filtrando por
// `pantalla === 'clases'` — ver components/portal/portal-preview-bridge.ts.

export function PortalPreviewClasesClient() {
  // Con un tema del kit se enseña el kit, no el portal de siempre.
  const kit = useVistaPreviaKit('clases');
  const { bloques, seleccionId, modo } = usePreviewBloques('clases');
  usePreviewClickToSelect(modo);
  // Solo en modo edición: navegando, el overlay del padre no se pinta.
  usePreviewMedidas(modo === 'editar');
  usePreviewResaltado(seleccionId);
  if (kit) return kit;
  return <PortalClasesView session={SESION_MUESTRA} escribible={false} bloquesOverride={bloques ?? undefined} />;
}

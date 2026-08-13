'use client';

import { PortalBonosView } from './portal-bonos-view';
import { SESION_MUESTRA } from '@/lib/theme/preview-sesion-muestra';
import { usePreviewBloques, usePreviewClickToSelect, usePreviewResaltado, usePreviewMedidas } from './portal-preview-bridge';
import { useVistaPreviaKit } from './vista-previa-kit';

// Mismo protocolo que portal-preview-home-client.tsx, filtrando por
// `pantalla === 'bonos'` — ver components/portal/portal-preview-bridge.ts.

export function PortalPreviewBonosClient() {
  // Con un tema del kit se enseña el kit, no el portal de siempre.
  const kit = useVistaPreviaKit('bonos');
  const { bloques, seleccionId, modo } = usePreviewBloques('bonos');
  usePreviewClickToSelect(modo);
  // Solo en modo edición: navegando, el overlay del padre no se pinta.
  usePreviewMedidas(modo === 'editar');
  usePreviewResaltado(seleccionId);
  if (kit) return kit;
  return <PortalBonosView session={SESION_MUESTRA} navegar={() => {}} bloquesOverride={bloques ?? undefined} />;
}

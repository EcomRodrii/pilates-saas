'use client';

import { PortalBonosView } from './portal-bonos-view';
import { SESION_MUESTRA } from '@/lib/theme/preview-sesion-muestra';

export function PortalPreviewBonosClient() {
  return <PortalBonosView session={SESION_MUESTRA} navegar={() => {}} />;
}

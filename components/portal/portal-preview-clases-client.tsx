'use client';

import { PortalClasesView } from './portal-clases-view';
import { SESION_MUESTRA } from '@/lib/theme/preview-sesion-muestra';

export function PortalPreviewClasesClient() {
  return <PortalClasesView session={SESION_MUESTRA} escribible={false} />;
}

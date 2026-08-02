'use client';

import { PortalReservasView } from './portal-reservas-view';
import { SESION_MUESTRA } from '@/lib/theme/preview-sesion-muestra';

// `navegar` no-op: "Ver horarios" llevaría a /portal/[slug]/clases (fuera de
// /portal-preview) — mismo criterio que Bonos.
export function PortalPreviewReservasClient() {
  return <PortalReservasView session={SESION_MUESTRA} escribible={false} navegar={() => {}} />;
}

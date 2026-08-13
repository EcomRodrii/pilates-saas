'use client';

import { PortalReservasView } from './portal-reservas-view';
import { SESION_MUESTRA } from '@/lib/theme/preview-sesion-muestra';
import { useVistaPreviaKit } from './vista-previa-kit';

// `navegar` no-op: "Ver horarios" llevaría a /portal/[slug]/clases (fuera de
// /portal-preview) — mismo criterio que Bonos.
export function PortalPreviewReservasClient() {
  // Con un tema del kit se enseña el kit, no el portal de siempre.
  const kit = useVistaPreviaKit('reservas');
  if (kit) return kit;
  return <PortalReservasView session={SESION_MUESTRA} escribible={false} navegar={() => {}} />;
}

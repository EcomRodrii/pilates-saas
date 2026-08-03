'use client';

import { PortalHomeView } from './portal-home-view';
import { SESION_MUESTRA } from '@/lib/theme/preview-sesion-muestra';
import { usePreviewBloques, usePreviewClickToSelect, usePreviewResaltado } from './portal-preview-bridge';

// Sesión de muestra: esta ruta nunca tiene una socia real (ver
// app/portal-preview/[slug]/layout.tsx, sin PortalAuthProvider). Sin
// reservas propias, PortalHomeView cae al estado "Sin clases reservadas" de
// la tarjeta grande — el resto (Esta semana, bloques del catálogo, colores,
// tipografía) es el catálogo REAL del estudio, cargado por useStudio() vía
// StudioSlugGate igual que en /reservar/[slug].
//
// El borrador de bloques (y la selección activa, Fase C del click-to-select)
// llega por postMessage — ver components/portal/portal-preview-bridge.ts.

export function PortalPreviewHomeClient() {
  const { bloques, seleccionId } = usePreviewBloques('home');
  usePreviewClickToSelect();
  usePreviewResaltado(seleccionId);
  return <PortalHomeView session={SESION_MUESTRA} homeBloquesOverride={bloques ?? undefined} />;
}

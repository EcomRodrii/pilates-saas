'use client';

import { PortalHomeView } from './portal-home-view';
import { SESION_MUESTRA } from '@/lib/theme/preview-sesion-muestra';
import { usePreviewBloques, usePreviewClickToSelect, usePreviewResaltado, usePreviewMedidas } from './portal-preview-bridge';
import { useVistaPreviaKit } from './vista-previa-kit';

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
  const { bloques, seleccionId, modo } = usePreviewBloques('home');
  // Con un tema del kit se enseña el kit, no el portal de siempre.
  const kit = useVistaPreviaKit('inicio');
  usePreviewClickToSelect(modo);
  // Solo en modo edición: navegando, el overlay del padre no se pinta.
  usePreviewMedidas(modo === 'editar');
  usePreviewResaltado(seleccionId);

  if (kit) return kit;

  // `escribible={false}`: el preview corre en un iframe del MISMO origen, así
  // que comparte localStorage con /portal/[slug]. Si la propietaria entró
  // alguna vez a su portal como socia en este navegador, el token sigue ahí y
  // la campana enseñaría avisos reales dentro del editor de temas.
  return <PortalHomeView session={SESION_MUESTRA} homeBloquesOverride={bloques ?? undefined} escribible={false} />;
}

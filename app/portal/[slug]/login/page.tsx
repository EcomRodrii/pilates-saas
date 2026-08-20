'use client';

// La misma puerta que /acceso, en la dirección de siempre.
//
// No se redirige a /acceso a propósito: un redirect en la pantalla más
// importante del producto añade un parpadeo y un salto de historial (volver
// atrás desde /home rebotaría entre las dos rutas). Pintar lo mismo cuesta
// nada y se comporta igual.

import { PuertaPortal } from '@/components/portal/acceso/puerta';

export default function PortalLogin() {
  return <PuertaPortal />;
}

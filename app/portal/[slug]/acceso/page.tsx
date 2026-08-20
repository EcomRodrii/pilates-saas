'use client';

// La puerta del portal. Todo lo que hace vive en `<PuertaPortal>`: esta ruta y
// /login pintan exactamente lo mismo.
//
// Fueron dos pantallas hermanas entre las que elegir, luego dos pasos, y ahora
// una sola. Las dos rutas siguen existiendo porque hay enlaces repartidos —los
// que el estudio comparte, los que las socias guardaron— y ninguno debe morir.

import { PuertaPortal } from '@/components/portal/acceso/puerta';

export default function PortalAcceso() {
  return <PuertaPortal />;
}

'use client';

import { TarjetaEnlace } from '@/components/configuracion/shell/tarjeta-enlace';

// Mi equipo: qué pueden hacer tus instructoras por su cuenta. Su único ajuste
// todavía vive dentro de las reglas de reserva.
export function SeccionEquipo(_props: { showToast: (m: string) => void }) {
  return <TarjetaEnlace id="ajuste-instructoras-crean-clases" />;
}

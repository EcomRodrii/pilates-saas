'use client';

import { TabEstudioCobros } from '@/components/configuracion/tab-estudio-cobros';
import { TarjetaEnlace } from '@/components/configuracion/shell/tarjeta-enlace';

// Cobros y facturas: cómo te pagan tus alumnas y qué sale en tus facturas.
export function SeccionCobros({ showToast }: { showToast: (m: string) => void }) {
  return (
    <>
      <TarjetaEnlace id="datos-fiscales" />
      <TarjetaEnlace id="integracion-stripe" />
      <TabEstudioCobros showToast={showToast} />
    </>
  );
}

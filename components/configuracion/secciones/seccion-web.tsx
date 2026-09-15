'use client';

import { TabEstudioEnlaces } from '@/components/configuracion/tab-estudio-enlaces';
import { TabDescubre } from '@/components/configuracion/tab-descubre';
import { TabApi } from '@/components/configuracion/tab-api';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';

// Mi app y mi web: cómo se ve tu estudio por fuera. El logo, el color y los
// textos de tu app están en «Marca» (seccion-marca.tsx).
export function SeccionWeb({ showToast }: { showToast: (m: string) => void }) {
  return (
    <>
      <TabEstudioEnlaces showToast={showToast} />
      <TarjetaAjuste id="contenido-de-tu-app" marco={false}>
        <TabDescubre />
      </TarjetaAjuste>
      <TabApi showToast={showToast} />
    </>
  );
}

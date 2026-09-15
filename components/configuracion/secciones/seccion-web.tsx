'use client';

import { TabMarca } from '@/components/configuracion/tab-marca';
import { TabTextosApp } from '@/components/configuracion/tab-textos-app';
import { TabEstudioEnlaces } from '@/components/configuracion/tab-estudio-enlaces';
import { TabDescubre } from '@/components/configuracion/tab-descubre';
import { TabApi } from '@/components/configuracion/tab-api';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';

// Mi app y mi web: cómo se ve tu estudio por fuera.
export function SeccionWeb({ showToast }: { showToast: (m: string) => void }) {
  return (
    <>
      <TabMarca showToast={showToast} />
      <TabTextosApp showToast={showToast} />
      <TabEstudioEnlaces showToast={showToast} />
      <TarjetaAjuste id="contenido-de-tu-app" marco={false}>
        <TabDescubre />
      </TarjetaAjuste>
      <TabApi showToast={showToast} />
    </>
  );
}

'use client';

import { TabEstudioEnlaces } from '@/components/configuracion/tab-estudio-enlaces';
import { TabDescubre } from '@/components/configuracion/tab-descubre';
import { TabApi } from '@/components/configuracion/tab-api';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';
import { TarjetaEnlace } from '@/components/configuracion/shell/tarjeta-enlace';

// Mi app y mi web: cómo se ve tu estudio por fuera.
export function SeccionWeb({ showToast }: { showToast: (m: string) => void }) {
  return (
    <>
      <TarjetaEnlace id="marca" />
      <TarjetaEnlace id="textos-de-tu-app" />
      <TabEstudioEnlaces showToast={showToast} />
      <TarjetaAjuste id="contenido-de-tu-app" marco={false}>
        <TabDescubre />
      </TarjetaAjuste>
      <TabApi showToast={showToast} />
    </>
  );
}

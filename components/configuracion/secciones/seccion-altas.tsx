'use client';

import { TabEstudioLegal } from '@/components/configuracion/tab-estudio-legal';
import { TabCamposPersonalizados } from '@/components/configuracion/tab-campos-personalizados';
import { TabCuestionarioSalud } from '@/components/configuracion/tab-cuestionario-salud';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';
import { TarjetaEnlace } from '@/components/configuracion/shell/tarjeta-enlace';

// Alta de alumnas: lo que acepta y rellena una alumna nueva.
export function SeccionAltas({ showToast }: { showToast: (m: string) => void }) {
  return (
    <>
      <TabEstudioLegal showToast={showToast} />
      <TarjetaEnlace id="compra-desde-tu-enlace" />
      <TarjetaAjuste id="datos-extra-de-la-ficha" marco={false}>
        <TabCamposPersonalizados showToast={showToast} />
      </TarjetaAjuste>
      <TabCuestionarioSalud showToast={showToast} />
    </>
  );
}

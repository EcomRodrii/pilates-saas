'use client';

import { TabDescubre } from '@/components/configuracion/tab-descubre';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';

// El mensaje destacado, las tarjetas de «Descubre» y los avisos del tablón.
export function HerramientaContenidoDeTuApp(_props: { showToast: (m: string) => void }) {
  return (
    <TarjetaAjuste id="contenido-de-tu-app" marco={false}>
      <TabDescubre />
    </TarjetaAjuste>
  );
}

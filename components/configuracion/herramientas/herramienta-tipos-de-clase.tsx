'use client';

import { TabClases } from '@/components/configuracion/tab-clases';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';

// El catálogo de tipos de clase, con el cajón de cada uno y sus reglas propias.
export function HerramientaTiposDeClase({ showToast }: { showToast: (m: string) => void }) {
  return (
    <TarjetaAjuste id="tipos-de-clase" marco={false}>
      <TabClases showToast={showToast} />
    </TarjetaAjuste>
  );
}

'use client';

import { TabPlantillasEmail } from '@/components/configuracion/tab-plantillas-email';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';

// Los correos que Tentare envía sola: encenderlos, apagarlos y editarlos.
export function HerramientaCorreosAutomaticos({ showToast }: { showToast: (m: string) => void }) {
  return (
    <TarjetaAjuste id="correos-automaticos" marco={false}>
      <TabPlantillasEmail showToast={showToast} />
    </TarjetaAjuste>
  );
}

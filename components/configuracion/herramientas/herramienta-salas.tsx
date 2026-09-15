'use client';

import { TabSalas } from '@/components/configuracion/tab-salas';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';

// Salas, con sus averías de máquina. Las averías se quedan aquí de momento:
// son del día a día y encajarían en Calendario, pero moverlas toca otro módulo.
export function HerramientaSalas({ showToast }: { showToast: (m: string) => void }) {
  return (
    <TarjetaAjuste id="salas" marco={false}>
      <TabSalas showToast={showToast} />
    </TarjetaAjuste>
  );
}

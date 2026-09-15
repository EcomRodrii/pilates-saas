'use client';

import { TabPlantillasEmail } from '@/components/configuracion/tab-plantillas-email';
import { TabIntegraciones } from '@/components/configuracion/tab-integraciones';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';

const INTEGRACIONES = ['RESEND', 'WHATSAPP', 'GMAIL'] as const;

// Cómo me comunico: los correos que salen solos y los canales conectados.
export function SeccionComunicacion({ showToast }: { showToast: (m: string) => void }) {
  return (
    <>
      <TarjetaAjuste id="correos-automaticos" marco={false}>
        <TabPlantillasEmail showToast={showToast} />
      </TarjetaAjuste>
      <TabIntegraciones showToast={showToast} tipos={INTEGRACIONES} />
    </>
  );
}

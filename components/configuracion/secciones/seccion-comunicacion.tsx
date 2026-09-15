'use client';

import { TabPlantillasEmail } from '@/components/configuracion/tab-plantillas-email';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';
import { TarjetaEnlace } from '@/components/configuracion/shell/tarjeta-enlace';

// Cómo me comunico: los correos que salen solos y los canales conectados.
export function SeccionComunicacion({ showToast }: { showToast: (m: string) => void }) {
  return (
    <>
      <TarjetaAjuste id="correos-automaticos" marco={false}>
        <TabPlantillasEmail showToast={showToast} />
      </TarjetaAjuste>
      <TarjetaEnlace id="integracion-resend" />
      <TarjetaEnlace id="integracion-whatsapp" />
      <TarjetaEnlace id="integracion-gmail" />
    </>
  );
}

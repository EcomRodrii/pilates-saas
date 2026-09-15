'use client';

import { TabDatosFiscales } from '@/components/configuracion/tab-datos-fiscales';
import { TabIntegraciones } from '@/components/configuracion/tab-integraciones';
import { TabEstudioCobros } from '@/components/configuracion/tab-estudio-cobros';

const INTEGRACIONES = ['STRIPE'] as const;

// Cobros y facturas: cómo te pagan tus alumnas y qué sale en tus facturas.
export function SeccionCobros({ showToast }: { showToast: (m: string) => void }) {
  return (
    <>
      <TabDatosFiscales showToast={showToast} />
      <TabIntegraciones showToast={showToast} tipos={INTEGRACIONES} />
      <TabEstudioCobros showToast={showToast} />
    </>
  );
}

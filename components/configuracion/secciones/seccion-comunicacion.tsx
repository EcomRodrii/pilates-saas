'use client';

import { useStudio } from '@/lib/studio-context';
import { resumenHerramienta } from '@/lib/configuracion/resumenes';
import { TabIntegraciones } from '@/components/configuracion/tab-integraciones';
import { FilasHerramienta } from '@/components/configuracion/shell/fila-herramienta';

const INTEGRACIONES = ['RESEND', 'WHATSAPP', 'GMAIL'] as const;

// Cómo me comunico: los correos que salen solos y los canales conectados. Los
// correos se editan en su propia pantalla; aquí se ve cuántos se envían.
export function SeccionComunicacion({ showToast }: { showToast: (m: string) => void }) {
  const { plantillasEmail, plantillasEmailCargadas } = useStudio();
  return (
    <>
      <FilasHerramienta
        filas={[{
          id: 'correos-automaticos',
          valor: resumenHerramienta('correos-automaticos', { correos: plantillasEmailCargadas ? plantillasEmail : null }),
        }]}
      />
      <TabIntegraciones showToast={showToast} tipos={INTEGRACIONES} />
    </>
  );
}

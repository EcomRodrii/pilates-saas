'use client';

import { useEffect, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { resumenHerramienta } from '@/lib/configuracion/resumenes';
import { TabEstudioEnlaces } from '@/components/configuracion/tab-estudio-enlaces';
import { FilasHerramienta } from '@/components/configuracion/shell/fila-herramienta';

// Mi app y mi web: cómo se ve tu estudio por fuera. El logo, el color y los
// textos de tu app están en «Marca» (seccion-marca.tsx).
//
// El contenido de tu app y el constructor de widgets tienen su propia pantalla:
// pintados aquí, la sección medía unas diez pantallas de móvil y un interruptor
// de una línea («Aparecer en Tentare Network») quedaba entre los dos.
export function SeccionWeb({ showToast }: { showToast: (m: string) => void }) {
  const { studio, dataLoaded, contenidoPortal, bannersPortal, novedadesEstudio } = useStudio();

  // Qué tarjetas siguen publicadas depende de la hora: se lee una vez al montar,
  // no en cada render (sería impuro).
  const [ahoraMs, setAhoraMs] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- La hora del reloj no se puede derivar en render; es justo lo que prohíbe la regla de pureza.
    setAhoraMs(Date.now());
  }, []);

  return (
    <>
      <TabEstudioEnlaces showToast={showToast} />
      <FilasHerramienta
        filas={[
          {
            id: 'contenido-de-tu-app',
            valor: resumenHerramienta('contenido-de-tu-app', {
              contenido: dataLoaded && ahoraMs > 0
                ? { mensajeDestacado: contenidoPortal?.mensajeDestacado ?? null, tarjetas: bannersPortal, avisos: novedadesEstudio, ahoraMs }
                : null,
            }),
          },
          { id: 'widgets', valor: resumenHerramienta('widgets', { widgetDominios: studio?.widgetDominiosAutorizados ?? null }) },
        ]}
      />
    </>
  );
}

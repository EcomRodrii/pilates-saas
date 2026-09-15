'use client';

import { useEffect, useState } from 'react';
import { Globe } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { resumenHerramienta } from '@/lib/configuracion/resumenes';
import type { TarjetaId } from '@/lib/configuracion/secciones';
import { DetalleDireccionYEnlaces, FilaDireccionYEnlaces } from '@/components/configuracion/tab-estudio-enlaces';
import { CajonAjuste, useCajonAbierto } from '@/components/configuracion/shell/cajon-ajuste';
import { FilaInterruptor, GrupoFilas } from '@/components/configuracion/shell/fila-ajuste';
import { FilaHerramienta } from '@/components/configuracion/shell/fila-herramienta';

// Mi app y mi web: cómo se ve tu estudio por fuera. El logo, el color y los
// textos de tu app están en «Marca» (seccion-marca.tsx).
//
// Filas con su valor de hoy (15-sep, v2): la dirección de tu página con
// «Copiar» y su cajón, Tentare Network como un sí/no que se guarda al tocarlo
// (sin dinero ni nada en cadena, y vuelve atrás si falla), y el contenido de tu
// app y los widgets, que tienen su propia pantalla (#2061). «Cómo le va a tu
// página» sigue dentro de los widgets.

const CAJONES = ['direccion-y-enlaces'] as const satisfies readonly TarjetaId[];

export function SeccionWeb({ showToast }: { showToast: (m: string) => void }) {
  const { studio, dataLoaded, updateStudio, contenidoPortal, bannersPortal, novedadesEstudio } = useStudio();
  const { cajon, abrir, cerrar } = useCajonAbierto(CAJONES);

  // Qué tarjetas siguen publicadas depende de la hora: se lee una vez al montar,
  // no en cada render (sería impuro).
  const [ahoraMs, setAhoraMs] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- La hora del reloj no se puede derivar en render; es justo lo que prohíbe la regla de pureza.
    setAhoraMs(Date.now());
  }, []);

  // Pone al estudio delante de gente que aún no lo conoce: apagado por defecto y
  // se da por bueno solo con la fila guardada (updateStudio cuenta filas).
  async function cambiarNetwork(v: boolean): Promise<string | null> {
    const res = await updateStudio({ visibleEnNetwork: v });
    if (!res.ok) return res.error;
    showToast(v ? 'Tu estudio ya aparece en Tentare Network' : 'Tu estudio ya no aparece en Tentare Network');
    return null;
  }

  const herramientas = [
    {
      id: 'contenido-de-tu-app' as const,
      valor: resumenHerramienta('contenido-de-tu-app', {
        contenido: dataLoaded && ahoraMs > 0
          ? { mensajeDestacado: contenidoPortal?.mensajeDestacado ?? null, tarjetas: bannersPortal, avisos: novedadesEstudio, ahoraMs }
          : null,
      }),
    },
    { id: 'widgets' as const, valor: resumenHerramienta('widgets', { widgetDominios: studio?.widgetDominiosAutorizados ?? null }) },
  ];

  return (
    <>
      <GrupoFilas titulo="Tu página y tu app">
        <FilaDireccionYEnlaces onAbrir={() => abrir('direccion-y-enlaces')} showToast={showToast} />
        <FilaInterruptor id="network" icono={Globe} on={dataLoaded && studio ? studio.visibleEnNetwork : null} onCambiar={cambiarNetwork} />
      </GrupoFilas>

      <GrupoFilas titulo="Lo que ven en tu app y en tu web">
        {herramientas.map(f => <FilaHerramienta key={f.id} {...f} />)}
      </GrupoFilas>

      <CajonAjuste id="direccion-y-enlaces" abierto={cajon === 'direccion-y-enlaces'} onCerrar={cerrar}>
        <DetalleDireccionYEnlaces showToast={showToast} />
      </CajonAjuste>
    </>
  );
}

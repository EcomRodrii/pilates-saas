'use client';

import { useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useCoincideMedio } from '@/lib/hooks/use-coincide-medio';
import { CONSULTA_ESCRITORIO } from '@/lib/panel/escritorio';
import {
  PANTALLAS_AMPLIABLES, cambiarAmpliado, estadoAmpliado, estadoAmpliadoServidor, suscribirAmpliado,
} from '@/lib/panel/ampliar';
import { cn } from '@/lib/utils';

/**
 * «Ampliar a toda la pantalla», junto al título de las pantallas grandes.
 *
 * Lo pinta PageHeader en todas y es el botón quien decide si toca, por la ruta
 * (mismo patrón que el ⓘ de ayuda): así una pantalla nueva de la lista lo tiene
 * sin tocar su página. 28 px y `-my-0.5` para no hacer más alta la línea del
 * título — en el Calendario esa altura es rejilla.
 */
export function BotonAmpliar() {
  const pathname = usePathname();
  const escritorio = useCoincideMedio(CONSULTA_ESCRITORIO);
  const ampliado = useSyncExternalStore(suscribirAmpliado, estadoAmpliado, estadoAmpliadoServidor);
  if (!escritorio || !PANTALLAS_AMPLIABLES.includes(pathname)) return null;
  return (
    <button
      type="button"
      onClick={() => cambiarAmpliado(!ampliado)}
      aria-pressed={ampliado}
      aria-label={ampliado ? 'Volver al tamaño normal' : 'Ampliar a toda la pantalla'}
      title={ampliado ? 'Volver al tamaño normal (Esc)' : 'Ampliar a toda la pantalla'}
      className={cn(
        '-my-0.5 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        ampliado && 'bg-muted text-foreground',
      )}
    >
      {ampliado ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
    </button>
  );
}

'use client';

import { useCore } from '@/lib/core-context';
import { useInterruptor } from './interruptores-cliente';

/**
 * ¿Ve este estudio «Mi app y mi web» v2 (interruptor por estudio `MI_WEB_NUEVA`, #2750)?
 * Un solo sitio para preguntarlo en el panel; el del servidor (la app de la alumna)
 * es `miWebNuevaPara`, en mi-web-nueva.ts, y los dos leen la misma variable.
 */
export function useMiWebNueva(): boolean {
  const { studio } = useCore();
  return useInterruptor('miWebNueva', studio?.id);
}

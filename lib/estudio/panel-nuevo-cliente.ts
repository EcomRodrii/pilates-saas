'use client';

import { useCore } from '@/lib/core-context';
import { useInterruptor } from './interruptores-cliente';

/**
 * ¿Ve este estudio el panel nuevo (interruptor `PANEL_NUEVO`, 14-oct-2026)?
 * Un solo sitio para preguntarlo: cada sección rehecha pinta su versión nueva
 * con esto y, si dice que no, la de siempre sin un píxel distinto.
 */
export function usePanelNuevo(): boolean {
  const { studio } = useCore();
  return useInterruptor('panelNuevo', studio?.id);
}

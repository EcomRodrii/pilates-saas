'use client';

import { useSyncExternalStore } from 'react';
import { esAppNativa } from './puente.ts';

const nada = () => () => {};

/**
 * ¿Esta pantalla corre dentro de la app de iOS? En el servidor y en el primer
 * pintado, `false` (lo mismo que la web): no hay desajuste de hidratación, y lo
 * propio de la app aparece en cuanto se monta.
 */
export function useAppNativa(): boolean {
  return useSyncExternalStore(nada, esAppNativa, () => false);
}

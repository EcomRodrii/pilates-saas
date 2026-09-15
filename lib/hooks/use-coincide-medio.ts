'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Si la ventana cumple una media query, y se actualiza al girar o redimensionar.
 *
 * `useSyncExternalStore` y no `matchMedia(...)` leído en el cuerpo: el snapshot
 * de servidor es `false`, y leerlo directo en el cliente desajustaría la
 * hidratación (mismo criterio que `useMenosMovimiento` en la landing).
 */
export function useCoincideMedio(consulta: string): boolean {
  const suscribir = useCallback((avisar: () => void) => {
    const mq = window.matchMedia(consulta);
    mq.addEventListener('change', avisar);
    return () => mq.removeEventListener('change', avisar);
  }, [consulta]);
  return useSyncExternalStore(
    suscribir,
    () => window.matchMedia(consulta).matches,
    () => false,
  );
}

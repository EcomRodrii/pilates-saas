'use client';

import { useEffect, useState } from 'react';

/**
 * `abreEl` mientras la reserva de la clase aún no se ha abierto; null en cuanto
 * llega la hora. Un solo `setTimeout` hasta ese instante: con el refresco de
 * cada minuto de las pantallas, a las 20:00 en punto el botón seguiría apagado
 * hasta 59 s, y con la reserva abriéndose a una hora fija es justo el minuto que
 * cuenta. Lo comparten /reservar, el widget y la app de la alumna.
 */
export function useAunNoAbre(abreEl: string | null | undefined): string | null {
  const [abierta, setAbierta] = useState<string | null>(null);
  useEffect(() => {
    if (!abreEl) return;
    // Los navegadores cortan los temporizadores de más de ~24,8 días. Si ya pasó,
    // se marca en la siguiente vuelta.
    const falta = Math.max(0, Date.parse(abreEl) - Date.now());
    const id = setTimeout(() => setAbierta(abreEl), Math.min(falta + 50, 2_147_000_000));
    return () => clearTimeout(id);
  }, [abreEl]);
  return abreEl && abierta !== abreEl ? abreEl : null;
}

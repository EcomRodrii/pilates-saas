'use client';

import { useLayoutEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { esPestanaAlumna, scrollAlVolver } from '@/lib/student/pestanas';

// Lo que hace que cambiar de pestaña se sienta nativo, aparte de los datos (que
// recuerda `useAsync` con `clave`):
//
//   · el SCROLL de cada pestaña: al volver a «Reservar» sigue donde se dejó,
//     como en cualquier app de iOS. La barra de abajo navega con
//     `scroll={false}`, así que el router no toca el scroll y lo pone esto;
//   · las animaciones de ENTRADA (`.a-up`, `.a-pop`…) solo la primera vez: una
//     lista que ya se había visto no vuelve a subir tarjeta a tarjeta.
//
// En memoria del módulo: se va al recargar, que es cuando debe irse.

const visitadas = new Set<string>();
const posiciones = new Map<string, number>();

/**
 * Devuelve si esta pantalla ya se había visto en esta carga de la app (para
 * apagar sus animaciones de entrada). Se decide UNA vez, al montar.
 */
export function useMemoriaDePestana(slug: string): boolean {
  const path = usePathname();
  // `typeof window`: en el servidor nada está visitado, igual que al hidratar la
  // primera pantalla de una carga en frío.
  const [revisita] = useState(() => typeof window !== 'undefined' && visitadas.has(path));

  // `useLayoutEffect`: el scroll se pone ANTES de pintar, sin un fotograma arriba.
  useLayoutEffect(() => {
    visitadas.add(path);
    const y = scrollAlVolver(esPestanaAlumna(path, slug), posiciones.get(path));
    if (y !== null && Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
    const guardar = () => { posiciones.set(path, window.scrollY); };
    window.addEventListener('scroll', guardar, { passive: true });
    return () => window.removeEventListener('scroll', guardar);
  }, [path, slug]);

  return revisita;
}

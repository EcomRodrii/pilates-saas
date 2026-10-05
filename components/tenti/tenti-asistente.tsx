'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { MS_MAX_BUSCANDO, estadoParaPintar } from '@/lib/tenti/asistente';
import type { MomentoAsistente } from '@/lib/asistente/estado-ui';
import type { PropsTenti } from './tenti';

// La cara del asistente («Pregúntale a Tentare»), en la cabecera de su panel y
// en ningún otro sitio (fundador, 5-oct-2026: Tentare SÍ responde preguntas, y
// responde Tenti, con los datos del estudio y su cara).
//
//   · Props cerrados: `momento` (el vocabulario del asistente, no el del motor:
//     lib/tenti/asistente.ts lo traduce) y `className`. Tamaño fijo de 56.
//   · `sonido={false}`: el motor sonaría en CADA cambio (pensar, buscar,
//     terminar: tres sonidos por pregunta). El panel suena una vez, 'pop', al
//     terminar una respuesta que la propietaria pidió (si «Sonidos de Tenti»
//     está encendido).
//   · Tope de animación: 'buscando' escanea sin fin; pasados MS_MAX_BUSCANDO
//     se queda en 'pensando', que duerme entre parpadeos.
//   · El motor llega en un chunk aparte (dynamic, sin SSR); mientras tanto, la
//     caja vacía del mismo tamaño (nada salta), y si no llega, vacía también.
//   · `data-momento` para los e2e: ningún test ve un canvas.
// De './tenti' solo se importa el tipo: un import de valor metería el motor en
// el chunk del panel.

function Nada() {
  return null;
}

const TentiCanvas = dynamic<PropsTenti>(
  () => import('./tenti').then((m) => m.Tenti).catch(() => Nada),
  { ssr: false, loading: () => null },
);

export function TentiAsistente({ momento, className }: { momento: MomentoAsistente; className?: string }) {
  const [agotado, setAgotado] = useState(false);
  const [previo, setPrevio] = useState(momento);
  if (previo !== momento) {
    setPrevio(momento);
    setAgotado(false);
  }
  useEffect(() => {
    if (momento !== 'consultando') return;
    const t = setTimeout(() => setAgotado(true), MS_MAX_BUSCANDO);
    return () => clearTimeout(t);
  }, [momento]);

  return (
    <span data-tenti-asistente="" data-momento={momento} aria-hidden="true" className={cn('relative block size-14 shrink-0', className)}>
      <TentiCanvas estado={estadoParaPintar(momento, agotado)} tamano={56} sonido={false} className="block" />
    </span>
  );
}

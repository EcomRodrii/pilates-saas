'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { MS_MAX_BUSCANDO, estadoParaPintar } from '@/lib/tenti/asistente';
import type { MomentoAsistente } from '@/lib/asistente/estado-ui';
import { dibujoDelIcono } from '@/lib/tenti/geometria';
import { SvgTenti } from './tenti-icono';
import type { PropsTenti } from './tenti';

// La cara del asistente («Pregúntale a Tentare»), en su chat (/asistente) y en
// ningún otro sitio (fundador, 5-oct-2026: Tentare SÍ responde preguntas, y
// responde Tenti, con los datos del estudio y su cara): grande en el saludo del
// chat vacío y de avatar en la respuesta en curso.
//
//   · Props cerrados: `momento` (el vocabulario del asistente, no el del motor:
//     lib/tenti/asistente.ts lo traduce), `tamano` (40, el avatar; 96, el
//     saludo) y `className`.
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

export function TentiAsistente({ momento, tamano, className }: { momento: MomentoAsistente; tamano: 40 | 96; className?: string }) {
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
    <span data-tenti-asistente="" data-momento={momento} aria-hidden="true" className={cn('relative block shrink-0', className)} style={{ width: tamano, height: tamano }}>
      <TentiCanvas estado={estadoParaPintar(momento, agotado)} tamano={tamano} sonido={false} className="block" />
    </span>
  );
}

const ALTO_QUIETO = Math.round(28 * dibujoDelIcono().proporcion * 100) / 100;

/**
 * El avatar de una respuesta que ya terminó: el dibujo QUIETO (el SVG del
 * icono), sin canvas ni motor. Solo la respuesta en curso lleva el Tenti vivo:
 * cuarenta canvas en una conversación larga serían cuarenta bucles de
 * fotogramas para nada.
 */
export function TentiAsistenteQuieto({ className }: { className?: string }) {
  return (
    <span data-tenti-asistente-quieto="" aria-hidden="true" className={cn('flex size-10 shrink-0 items-center justify-center', className)}>
      <SvgTenti ancho={28} alto={ALTO_QUIETO} sobre="normal" />
    </span>
  );
}

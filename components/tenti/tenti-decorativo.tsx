'use client';

import dynamic from 'next/dynamic';
import { createContext, useContext, type ReactNode } from 'react';
import type { PropsTenti } from './tenti';

// Tenti vivo y decorativo, para lo que ve TODO el panel a diario: la fila del
// input del buscador ⌘K y el resumen del día de Automatizaciones (decisión del
// fundador del 5-oct). A diferencia de TentiDiferido (solo la propietaria,
// caja vacía mientras carga), aquí:
//
//   · Lo ve cualquier rol: el buscador es de todos.
//   · Mientras llega el chunk se ve `reserva`, lo de siempre en ese sitio (la
//     lupa, la baldosa del Zap), en la misma caja: nada salta. Si el chunk no
//     llega, `reserva` también; y si llega pero no hay canvas 2D, Tenti la
//     recibe por props y la pinta él.
//   · Siempre en 'reposo', sin sonido, sin toques, sin insignias, sin saludo y
//     sin seguir al cursor (con el ratón en movimiento el bucle iría a 60 fps).
//     No hay prop para pedir otra cosa: el tsc del CI lo vigila, y la guardia
//     lib/tenti/donde-vive-tenti.test.ts vigila quién lo usa y a qué tamaño.
//   · Solo `mira`: hacia dónde mira en horizontal (el buscador, hacia el texto).
//
// El motor duerme entre parpadeos (tenti.tsx), así que en reposo cuesta unos
// pocos fotogramas por segundo. Quien lo monta decide CUÁNDO vive: el buscador,
// solo con la hoja abierta.
//
// De './tenti' solo se importa el tipo: un import de valor metería el motor en
// el chunk de quien importa este fichero, que en el buscador es todo el panel.

export interface PropsTentiDecorativo {
  /** Lado de la caja en px, fijo por sitio (cambiarlo recrea el motor): 40 en
   *  la fila del buscador, 56 en el resumen de Automatizaciones. Por debajo de
   *  64 el motor va en modo mini, que en reposo y sin insignias es el mismo
   *  dibujo (solo cambia la insignia y las partículas de ambiente). */
  tamano: 40 | 56;
  /** Lo de siempre en ese sitio, del mismo tamaño que la caja. */
  reserva: ReactNode;
  /** Hacia dónde mira, de -1 (izquierda) a 1 (derecha). */
  mira?: number;
  className?: string;
}

const ReservaCtx = createContext<ReactNode>(null);

function SoloReserva(): ReactNode {
  return useContext(ReservaCtx);
}

const TentiCanvas = dynamic<PropsTenti>(
  () => import('./tenti').then((m) => m.Tenti).catch(() => SoloReserva),
  { ssr: false, loading: () => <SoloReserva /> },
);

export function TentiDecorativo({ tamano, reserva, mira, className }: PropsTentiDecorativo) {
  return (
    <ReservaCtx.Provider value={reserva}>
      <TentiCanvas estado="reposo" tamano={tamano} mira={mira} reserva={reserva} className={className} />
    </ReservaCtx.Provider>
  );
}

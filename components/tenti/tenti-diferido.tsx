'use client';

import dynamic from 'next/dynamic';
import { createContext, useContext, type ReactNode } from 'react';
import { useRol } from '@/lib/permisos';
import type { PropsTenti } from './tenti';

// Tenti para pantallas que cuelgan de algo que se carga siempre (Listo cuelga de
// /calendario y de PrimerHorario, que la importan sin diferir). Aquí se decide
// todo lo que tiene que ser verdad ANTES de descargar el motor:
//
//   · Solo la PROPIETARIA lo ve. Con cualquier otro rol se pinta `reserva` y el
//     chunk no se pide nunca: la recepción que abre el calendario con alumnas
//     delante no carga una mascota que no va a ver. No depende de que cada
//     pantalla se acuerde de comprobarlo.
//   · Mientras llega el chunk, la caja va VACÍA, no con `reserva`: si no, se
//     vería saltar del icono de hoy a Tenti justo antes de la celebración.
//   · Si el chunk no llega (red, despliegue nuevo), `reserva`. Y si llega pero
//     no hay canvas 2D, también: Tenti la recibe por props y la pinta él.
//
// ⚠️ `estado` acepta solo 'reposo' y 'hecho', y no hay forma de pedir sonido,
// saludo, toques ni insignias: el tsc del CI lo vigila, no una regex. Quien
// necesite más, que lo hable antes (ver la guardia lib/tenti/donde-vive-tenti).
// De './tenti' solo se importa el tipo: un import de valor metería el motor en
// el chunk de quien importa este fichero.

export interface PropsTentiDiferido {
  estado: 'reposo' | 'hecho';
  /** Fijo en cada sitio: cambiarlo recrea el motor. Mínimo 64, para no entrar en modo mini. */
  tamano: number;
  sigueCursor?: boolean;
  /** El icono de siempre, para otros roles o si Tenti no se puede pintar. */
  reserva: ReactNode;
}

const ReservaCtx = createContext<ReactNode>(null);

function SoloReserva(): ReactNode {
  return useContext(ReservaCtx);
}

function CajaVacia() {
  return null;
}

const TentiCanvas = dynamic<PropsTenti>(
  () => import('./tenti').then((m) => m.Tenti).catch(() => SoloReserva),
  { ssr: false, loading: () => <CajaVacia /> },
);

export function TentiDiferido({ estado, tamano, sigueCursor = false, reserva }: PropsTentiDiferido) {
  const rol = useRol();
  if (rol !== 'PROPIETARIO') return <>{reserva}</>;
  return (
    <ReservaCtx.Provider value={reserva}>
      <TentiCanvas estado={estado} tamano={tamano} sigueCursor={sigueCursor} reserva={reserva} />
    </ReservaCtx.Provider>
  );
}

'use client';

import { useRef, type CSSProperties, type ReactNode } from 'react';
import { useTintaSobreFoto } from '@/lib/nativo/use-tinta-sobre-foto';

/**
 * La caja de una foto que sube hasta arriba, por detrás de la hora y la batería.
 * En la app de iOS pone la barra de estado en letras claras mientras la foto
 * está detrás, y la devuelve a la normal al bajar o al salir (`useTintaSobreFoto`).
 * Para una pantalla de servidor (la ficha de un estudio en `/app`), que no puede
 * usar el hook ella misma. En la web es un `div` sin más.
 */
export function FotoBajoLaBarra({ style, children, fondoOscuro = false }: {
  style?: CSSProperties;
  children: ReactNode;
  fondoOscuro?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useTintaSobreFoto(ref, fondoOscuro);
  return <div ref={ref} data-foto-bajo-la-barra="" style={style}>{children}</div>;
}

'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { MarcoIphone, medidaIphone, useEscalaIphone } from '@/components/ui/marco-iphone';

// Una web abierta en el iPhone del panel (`MarcoIphone`, components/ui/marco-iphone.tsx):
// debajo de la barra de estado, la barra de dirección dibujada y, debajo, la página, que
// se desplaza DENTRO de la pantalla. Lo usan la vista previa de «Tu web» v2 en «Móvil» y
// el escaparate de la portada vacía.
//
// Lo de dentro es /reservar (una web en el navegador del móvil), no la app de la alumna:
// no hay `--safe-top` que poner. Lo que sí hace falta es que la barra de estado del marco
// (que va ENCIMA de la pantalla, como en el teléfono) no tape nada: el hueco de arriba se
// toma de lo que mide esa barra en el propio marco, no de un número escrito aquí.

const ANCHO_TELEFONO = medidaIphone(1).ancho;

/**
 * La escala del iPhone: tamaño real (1) si cabe a lo alto de la ventana (`useEscalaIphone`)
 * y a lo ancho de lo que lo contiene (`ancho`); si no, la que quepa, sin cortar nada.
 */
export function useEscalaIphoneEn(ancho: number, opc: { max?: number; reservado?: number } = {}): number {
  const porAlto = useEscalaIphone(opc.max ?? 1, opc.reservado ?? 260);
  if (ancho <= 0) return porAlto;
  return Math.min(porAlto, Math.floor((ancho / ANCHO_TELEFONO) * 100) / 100);
}

/** Lo que mide por dentro un elemento a lo ancho, al momento y al cambiar. */
export function useAnchoDe<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [ancho, setAncho] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setAncho(el.clientWidth);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, ancho] as const;
}

export function IphoneConWeb({ escala, direccion, fondo, desplazable = true, children }: {
  escala: number;
  /** La dirección de la barra del navegador (`null`: «tu web»). */
  direccion: string | null;
  /** El fondo de la página (el de su web). */
  fondo: string;
  /** `false` en un escaparate que no se toca: sin desplazamiento dentro. */
  desplazable?: boolean;
  children: ReactNode;
}) {
  const envoltorio = useRef<HTMLDivElement | null>(null);
  // El alto de la barra de estado del marco (sin la escala: va dentro de la pantalla a tamaño real).
  const [altoEstado, setAltoEstado] = useState(0);
  useLayoutEffect(() => {
    const barra = envoltorio.current?.querySelector<HTMLElement>('[data-testid="iphone-estado"]');
    if (barra) setAltoEstado(barra.offsetHeight);
  }, []);
  return (
    <div ref={envoltorio} className="mx-auto w-fit" data-marco-movil="">
      {/* El navegador del móvil es claro: la hora y la barrita van en oscuro arriba; abajo, sobre su web, se invierten solas. */}
      <MarcoIphone escala={escala} tinta="oscura" indicador="auto" modelo="17-pro">
        <div className="flex h-full flex-col bg-white">
          <div aria-hidden style={{ height: altoEstado }} className="shrink-0" />
          <div aria-hidden className="shrink-0 px-4 pb-2">
            <span className="mx-auto flex h-9 max-w-[300px] items-center justify-center gap-1.5 rounded-full bg-black/[0.06] px-4 text-[13px] text-black/60">
              <Lock size={11} className="shrink-0" />
              <span className="truncate">{direccion ?? 'tu web'}</span>
            </span>
          </div>
          <div
            // Sin barra de desplazamiento a la vista, como en un móvil: si no, la del ordenador
            // le quitaba 15 px a la página y el widget ya no iba a su ancho de verdad.
            className={desplazable
              ? 'min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
              : 'min-h-0 flex-1 overflow-hidden'}
            style={{ background: fondo }}
            data-vista-previa=""
          >
            {children}
          </div>
        </div>
      </MarcoIphone>
    </div>
  );
}

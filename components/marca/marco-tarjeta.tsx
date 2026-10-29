'use client';

import { useLayoutEffect, useRef } from 'react';
import './marco-tarjeta.css';

/**
 * La tarjeta blanca sobre el fondo difuminado de la demo, para el alta.
 *
 * Cabe SIEMPRE entera en la ventana (salvo en el móvil, donde un formulario se desliza como siempre): si es más alta que la
 * ventana, se encoge lo justo con `zoom`; nunca se agranda. `zoom` y no `transform: scale` porque ocupa el sitio que ocupa lo que
 * se ve, así que no deja un hueco ni una barra de desplazamiento. `offsetHeight` devuelve la altura SIN encoger, de modo que
 * medir no depende de lo que ya se haya encogido y no hay bucle.
 */
const ESCALA_MINIMA = 0.62;
const ANCHO_MINIMO_PARA_AJUSTAR = 640; // por debajo es el móvil: la tarjeta ocupa toda la pantalla y se desliza

export function MarcoTarjeta({ children, ancho = 'normal' }: { children: React.ReactNode; ancho?: 'estrecho' | 'normal' | 'amplio' }) {
  const raiz = useRef<HTMLDivElement>(null);
  const tarjeta = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const r = raiz.current, t = tarjeta.current;
    if (!r || !t) return;
    let actual = 1;
    let pendiente = 0;
    const ajustar = () => {
      const margen = parseFloat(getComputedStyle(r).paddingTop) * 2;
      const hueco = window.innerHeight - margen;
      const natural = t.offsetHeight;
      const z = window.innerWidth < ANCHO_MINIMO_PARA_AJUSTAR || natural <= hueco ? 1 : Math.max(ESCALA_MINIMA, hueco / natural);
      if (Math.abs(z - actual) < 0.005) return;
      actual = z;
      t.style.zoom = z === 1 ? '' : String(z);
    };
    const luego = () => { cancelAnimationFrame(pendiente); pendiente = requestAnimationFrame(ajustar); };
    ajustar();
    window.addEventListener('resize', luego);
    // El contenido cambia de alto (un aviso de error, el paso siguiente del alta): se vuelve a medir.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(luego);
    ro?.observe(t.firstElementChild ?? t);
    return () => { window.removeEventListener('resize', luego); ro?.disconnect(); cancelAnimationFrame(pendiente); };
  }, []);

  return (
    <div className="mt-raiz" ref={raiz}>
      <div className="mt-fondo" aria-hidden="true" />
      <div className="mt-tarjeta" data-ancho={ancho} ref={tarjeta}>{children}</div>
    </div>
  );
}

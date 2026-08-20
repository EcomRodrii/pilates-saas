'use client';

import { useEffect, useRef, useState } from 'react';

// Scroll-reveal para las secciones de /network que quedan por debajo del
// hero — el fundador pidió "más vivo, pero sobrio" tras ver el rediseño
// (nada de exceso de animaciones, solo criterio). Solo `children`/`delayMs`/
// `className` como props: nunca un handler de evento, así que es seguro
// montarlo desde app/network/page.tsx (Server Component) sin repetir el bug
// de TarjetaInstructora.tsx (pasar un `onMouseEnter` desde servidor SÍ tumba
// el build; pasar JSX como children no).
//
// Dispara una sola vez (se desconecta al hacerse visible): esto es "la
// sección aparece al llegar", no un efecto que se repite al subir y bajar.
export function Reveal({
  children, delayMs = 0, className = '', style,
}: {
  children: React.ReactNode;
  /** Escalonado entre elementos de una misma lista (PROBLEMA_ITEMS, CONFIANZA_ITEMS…). */
  delayMs?: number;
  className?: string;
  /** Se fusiona con el opacity/transform/transition del propio reveal — para pintar fondo/borde en el mismo nodo sin envolver en un div extra. */
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Con reduced-motion, visible desde el primer render (no en un setState()
  // dentro del efecto — eso dispara un render en cascada que el linter de
  // React Compiler rechaza). El bloque global de app/globals.css ya anula la
  // transición igualmente; esto solo evita el "opacity:0" a medio camino si
  // el observer tardara en disparar.
  const [visible, setVisible] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const el = ref.current;
    // Repite la misma comprobación que el estado inicial en vez de leer
    // `visible` aquí: así el efecto no depende de estado que él mismo
    // cambia, y sigue montándose una única vez con deps `[]`.
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...style,
        opacity: visible ? 1 : 0,
        // Sin valor una vez visible (en vez de fijar 'translateY(0)'): un
        // inline style siempre gana a una clase, así que forzar el 0 aquí
        // bloquearía para siempre cualquier `hover:-translate-y-*` que la
        // llamadora ponga en el mismo nodo (las cards de CTA/confianza lo
        // hacen). "Sin transform" y "translateY(0)" se ven igual en reposo;
        // solo la primera deja que el hover mande después.
        transform: visible ? undefined : 'translateY(20px)',
        transition: `opacity .65s cubic-bezier(.16,1,.3,1) ${delayMs}ms, transform .65s cubic-bezier(.16,1,.3,1) ${delayMs}ms`,
      }}
    >
      {children}
    </div>
  );
}

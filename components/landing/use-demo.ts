'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

// Motor de las demos animadas de la landing v5.
//
// Reproduce las dos garantías que ya traía el diseño original y que conviene
// no perder al portarlo:
//
//  1. **Solo avanza si la sección está a la vista.** Cuatro `setInterval`
//     corriendo a la vez en una página que nadie está mirando es batería
//     gastada y renders inútiles. Un IntersectionObserver los deja dormidos.
//  2. **Con `prefers-reduced-motion` no anima: se queda en un fotograma fijo.**
//     Y no en el primero —que suele ser el estado "buscando…", el menos
//     informativo—, sino en el que cuenta el resultado.

/**
 * La preferencia de movimiento, como fuente externa.
 *
 * ⚠️ `useSyncExternalStore` y no un `setState` dentro de un efecto: el React
 * Compiler de este repo rechaza lo segundo ("Calling setState synchronously
 * within an effect can trigger cascading renders"), y con razón. Esto además
 * es SSR-seguro por construcción —el snapshot de servidor es `false`— y se
 * entera si el sistema cambia la preferencia con la página abierta.
 */
function useMenosMovimiento(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      mq.addEventListener('change', avisar);
      return () => mq.removeEventListener('change', avisar);
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}

export function useDemo(
  fotogramas: number,
  ms: number,
  opts?: {
    /**
     * Fotograma fijo cuando el sistema pide menos movimiento. Por defecto el
     * último; se puede apuntar a otro si la secuencia no termina en el estado
     * más explicativo.
     */
    fotogramaQuieto?: number;
  },
) {
  const quieto = opts?.fotogramaQuieto ?? fotogramas - 1;
  const menos = useMenosMovimiento();

  const [n, setN] = useState(0);
  // Al usar un control manual el ciclo se para: que la animación te cambie el
  // paso mientras lo estás leyendo es lo que hace insufribles estas demos.
  const [aMano, setAMano] = useState(false);
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (menos || aMano) return;
    const el = ref.current;
    if (!el) return;

    let visible = false;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.2 });
    io.observe(el);

    const t = setInterval(() => {
      if (visible) setN((x) => (x + 1) % fotogramas);
    }, ms);

    return () => { io.disconnect(); clearInterval(t); };
  }, [fotogramas, ms, menos, aMano]);

  const ir = useCallback((x: number) => { setAMano(true); setN(x); }, []);

  // El fotograma se DERIVA, no se escribe en un efecto: con menos movimiento
  // sale el fijo, salvo que se haya elegido uno a mano.
  const i = menos && !aMano ? quieto : n;

  return { i, ref, ir };
}

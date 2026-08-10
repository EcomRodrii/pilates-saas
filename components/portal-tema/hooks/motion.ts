"use client";

import { useEffect, useRef, useState } from "react";

function prefiereMenosMovimiento() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Cuenta de 0 al valor final. Respeta `prefers-reduced-motion`. */
export function useCountUp(to: number, ms = 460) {
  // Se decide al montar y no dentro del efecto: escribir estado ahí
  // (`set-state-in-effect`) provoca un render extra, y hacerlo en un segundo
  // efecto dejaría correr un par de fotogramas de conteo justo a quien ha
  // pedido menos movimiento. En servidor da `false`, pero el valor pintado es
  // `to` en ambas ramas, así que la hidratación no cambia de resultado.
  const [reduced] = useState(prefiereMenosMovimiento);
  const [value, setValue] = useState(to);
  const frame = useRef<number>(0);

  useEffect(() => {
    if (reduced) return;

    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(to * eased));
      if (p < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [to, ms, reduced]);

  return reduced ? to : value;
}

/** True cuando el sistema pide menos movimiento. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return reduced;
}

'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

// Reinicia una animación CSS cada vez que `clave` cambia, sin remontar
// `children` — mismo patrón que PanelPageTransition
// (components/layout/panel-page-transition.tsx), generalizado para
// cualquier "cambio de vista" que lo necesite (aquí: navegación día/semana/
// mes del calendario, donde `children` sigue vivo con datos en vuelo — ver
// cargarDatosVista en app/(dashboard)/calendario/page.tsx — y remontar
// perdería esa preservación visual).
export function ReanimarAlCambiar({
  clave, className, animClassName, children,
}: {
  clave: string | number;
  /** Clases estáticas del contenedor (layout) — nunca se tocan. */
  className?: string;
  /** Un ÚNICO nombre de clase con la animación CSS a reiniciar.
   *  `DOMTokenList.remove()`/`.add()` no aceptan una cadena con varios
   *  tokens separados por espacio (lanza `InvalidCharacterError`) — de ahí
   *  que vaya separado de `className` en vez de ser la misma prop. */
  animClassName: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const claveAnterior = useRef(clave);

  useEffect(() => {
    if (claveAnterior.current === clave) return;
    claveAnterior.current = clave;
    const el = ref.current;
    if (!el) return;
    el.classList.remove(animClassName);
    void el.offsetWidth;
    el.classList.add(animClassName);
  }, [clave, animClassName]);

  return <div ref={ref} className={cn(className, animClassName)}>{children}</div>;
}

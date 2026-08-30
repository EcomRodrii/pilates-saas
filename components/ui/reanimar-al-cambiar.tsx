'use client';

import { useEffect, useRef } from 'react';

// Reinicia una animación CSS cada vez que `clave` cambia, sin remontar
// `children` — mismo patrón que PanelPageTransition
// (components/layout/panel-page-transition.tsx), generalizado para
// cualquier "cambio de vista" que lo necesite (aquí: navegación día/semana/
// mes del calendario, donde `children` sigue vivo con datos en vuelo — ver
// cargarDatosVista en app/(dashboard)/calendario/page.tsx — y remontar
// perdería esa preservación visual).
export function ReanimarAlCambiar({
  clave, className, children,
}: { clave: string | number; className: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const claveAnterior = useRef(clave);

  useEffect(() => {
    if (claveAnterior.current === clave) return;
    claveAnterior.current = clave;
    const el = ref.current;
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }, [clave, className]);

  return <div ref={ref} className={className}>{children}</div>;
}

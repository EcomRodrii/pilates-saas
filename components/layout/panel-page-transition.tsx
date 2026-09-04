'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

// Envuelve el contenido del panel para que cambiar de ruta no se sienta
// como "desaparece → aparece de golpe" (auditoría de motion, sección 3).
// No remonta `children` (perdería estado y dispararía refetches en cada
// navegación) — App Router ya reconcilia el contenido nuevo antes de que
// este efecto corra; aquí solo se reinicia la animación CSS sobre ese
// contenido ya presente, quitando y reponiendo la clase para forzar un
// reflow (si solo se reañadiera la misma clase, el navegador no reinicia
// una animación ya "terminada").
export function PanelPageTransition({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const el = ref.current;
    if (!el) return;
    el.classList.remove('panel-page-in');
    void el.offsetWidth;
    el.classList.add('panel-page-in');
  }, [pathname]);

  return (
    <div ref={ref} className="panel-page-in">
      {children}
    </div>
  );
}

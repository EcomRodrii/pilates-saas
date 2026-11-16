'use client';

import { useState } from 'react';
import { SelectorIntervalo } from '@/components/planes/selector-intervalo';
import type { IntervaloUi } from '@/lib/billing/intervalo-ui';

// Isla cliente del selector de la home. Las dos cifras (mes y año) ya vienen en el
// HTML del servidor y el atributo `data-intervalo` de la rejilla decide cuál se ve
// (figma.css): sin JavaScript la home sigue diciendo el precio mensual.
export function SelectorPreciosHome() {
  const [intervalo, setIntervalo] = useState<IntervaloUi>('mensual');
  function cambiar(i: IntervaloUi) {
    setIntervalo(i);
    document.getElementById('lf-planes')?.setAttribute('data-intervalo', i);
  }
  return (
    <div className="lf-selector-precios">
      <SelectorIntervalo valor={intervalo} onCambio={cambiar} />
    </div>
  );
}

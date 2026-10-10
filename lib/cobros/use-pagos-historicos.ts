'use client';

import { useEffect, useState } from 'react';
import { obtenerResumenPagosHistoricos } from '@/lib/api-client';
import { useRol } from '@/lib/permisos';
import { puedeVerFinanzas } from '@/lib/permisos-reglas';
import type { PagosHistoricosDelDia } from './pagos-historicos';

/**
 * Lo importado de la plataforma anterior, por día, para enseñarlo AL LADO de lo
 * cobrado (no dentro). Fuera del snapshot global del panel a propósito, como la
 * ficha de la clienta: una consulta aparte, solo para quien ve finanzas.
 * `null` mientras carga o si no se pudo leer (entonces la línea no sale).
 */
export function usePagosHistoricos(): { dias: PagosHistoricosDelDia[]; completo: boolean } | null {
  const verFinanzas = puedeVerFinanzas(useRol());
  const [datos, setDatos] = useState<{ dias: PagosHistoricosDelDia[]; completo: boolean } | null>(null);
  useEffect(() => {
    if (!verFinanzas) return;
    let ignorar = false;
    void obtenerResumenPagosHistoricos().then(r => { if (!ignorar && r) setDatos(r); });
    return () => { ignorar = true; };
  }, [verFinanzas]);
  return datos;
}

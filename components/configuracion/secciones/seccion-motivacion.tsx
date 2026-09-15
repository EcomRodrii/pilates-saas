'use client';

import { useEffect } from 'react';
import { useStudio } from '@/lib/studio-context';
import { PlanGate } from '@/components/ui/plan-gate';
import { TabRecompensas } from '@/components/configuracion/tab-recompensas';
import { TabCanjes } from '@/components/configuracion/tab-canjes';
import { TabLogros } from '@/components/configuracion/tab-logros';
import { TabNiveles } from '@/components/configuracion/tab-niveles';
import { TabRetos } from '@/components/configuracion/tab-retos';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';

// Motivación: créditos, recompensas, logros, niveles y retos que ve la alumna
// en su app.
export function SeccionMotivacion({ showToast }: { showToast: (m: string) => void }) {
  const { studio, cargarGamificacion } = useStudio();

  // Las diez tablas de gamificación NO vienen en el arranque del panel: se
  // sacaron de ahí en #1375 y ninguna función las recogió después, así que las
  // pantallas leían un estado que nadie rellenaba (ver el comentario de
  // `fetchGamificacionStudio`). Se piden aquí, que es el único sitio del panel
  // que las usa. `cargarGamificacion` es idempotente por estudio.
  useEffect(() => { cargarGamificacion(); }, [cargarGamificacion]);

  return (
    <PlanGate studio={studio ?? {}} feature="gamificacion">
      <TabRecompensas showToast={showToast} />
      <TarjetaAjuste id="canjes" marco={false}>
        <TabCanjes showToast={showToast} />
      </TarjetaAjuste>
      <TabLogros showToast={showToast} />
      <TabNiveles showToast={showToast} />
      <TabRetos showToast={showToast} />
    </PlanGate>
  );
}

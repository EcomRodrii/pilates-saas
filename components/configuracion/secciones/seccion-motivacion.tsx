'use client';

import { useEffect } from 'react';
import { useStudio } from '@/lib/studio-context';
import { resumenHerramienta } from '@/lib/configuracion/resumenes';
import { PlanGate } from '@/components/ui/plan-gate';
import { TabRecompensas } from '@/components/configuracion/tab-recompensas';
import { FilasHerramienta } from '@/components/configuracion/shell/fila-herramienta';

// Motivación: cómo funcionan tus créditos y, en su propia pantalla, las
// recompensas, canjes, logros, niveles y retos que ve la alumna en su app.
export function SeccionMotivacion({ showToast }: { showToast: (m: string) => void }) {
  const {
    studio, cargarGamificacion, gamificacionCargada,
    rewardCatalog, achievementDefinitions, levelDefinitions, challengeDefinitions,
  } = useStudio();

  // Las diez tablas de gamificación NO vienen en el arranque del panel: se
  // sacaron de ahí en #1375 y ninguna función las recogió después, así que las
  // pantallas leían un estado que nadie rellenaba (ver el comentario de
  // `fetchGamificacionStudio`). Se piden aquí y en la pantalla de la
  // herramienta, que son los únicos sitios del panel que las usan.
  // `cargarGamificacion` es idempotente por estudio.
  useEffect(() => { cargarGamificacion(); }, [cargarGamificacion]);

  return (
    <PlanGate studio={studio ?? {}} feature="gamificacion">
      <TabRecompensas showToast={showToast} parte="reglas" />
      <FilasHerramienta
        filas={[{
          id: 'recompensas-y-logros',
          valor: resumenHerramienta('recompensas-y-logros', {
            motivacion: gamificacionCargada
              ? { recompensas: rewardCatalog.length, logros: achievementDefinitions.length, niveles: levelDefinitions.length, retos: challengeDefinitions.length }
              : null,
          }),
        }]}
      />
    </PlanGate>
  );
}

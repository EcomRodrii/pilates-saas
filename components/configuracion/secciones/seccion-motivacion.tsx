'use client';

import { useEffect, type ReactNode } from 'react';
import { Coins, Sparkles } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { REWARD_TRIGGERS } from '@/lib/engines/reward-engine';
import { PLAN_INFO, accesoProducto, entitlementsDe, planMinimoPara, tieneFeature } from '@/lib/billing/entitlements';
import { nombreCreditos } from '@/lib/creditos-nombre';
import {
  estadoDelPlan, resumenCreditosPorAccion, resumenHerramienta, resumenReglasCreditos,
} from '@/lib/configuracion/resumenes';
import type { TarjetaId } from '@/lib/configuracion/secciones';
import { PlanGate } from '@/components/ui/plan-gate';
import { FormCreditosPorAccion, FormReglasCreditos } from '@/components/configuracion/creditos';
import { CajonAjuste, useCajonAbierto } from '@/components/configuracion/shell/cajon-ajuste';
import { FilaAjuste, GrupoFilas } from '@/components/configuracion/shell/fila-ajuste';
import { FilaHerramienta } from '@/components/configuracion/shell/fila-herramienta';

// Motivación: cómo funcionan tus créditos y, en su propia pantalla, las
// recompensas, canjes, logros, niveles y retos que ve la alumna en su app.
//
// Filas con su valor de hoy (15-sep, v2). Las reglas se guardaban al salir de
// cada campo: ahora son dos cajones con un solo «Guardar» (creditos.tsx).
//
// El plan va en la pastilla de cada fila («Incluido en tu plan» / «Desde el plan
// Estudio») en vez de tapar la sección entera: se ve qué hay y cómo está, y lo
// que no incluye tu plan se ve dentro pero no se toca (PlanGate).
//
// Los canjes pendientes no se cuentan aquí: son trabajo, no un ajuste, y ya los
// cuenta la bandeja de Inicio (lib/estado-estudio.ts).

const CAJONES = ['reglas', 'creditos-por-accion'] as const satisfies readonly TarjetaId[];
const DISPARADORES = REWARD_TRIGGERS.map(d => d.trigger);

export function SeccionMotivacion({ showToast }: { showToast: (m: string) => void }) {
  const {
    studio, dataLoaded, cargarGamificacion, gamificacionCargada, rewardRules,
    rewardCatalog, achievementDefinitions, levelDefinitions, challengeDefinitions,
  } = useStudio();
  const { cajon, abrir, cerrar } = useCajonAbierto(CAJONES);

  // Las diez tablas de gamificación NO vienen en el arranque del panel: se
  // sacaron de ahí en #1375 y ninguna función las recogió después, así que las
  // pantallas leían un estado que nadie rellenaba (ver el comentario de
  // `fetchGamificacionStudio`). Se piden aquí y en la pantalla de la
  // herramienta, que son los únicos sitios del panel que las usan.
  // `cargarGamificacion` es idempotente por estudio.
  useEffect(() => { cargarGamificacion(); }, [cargarGamificacion]);

  function guardado(texto: string) {
    cerrar();
    showToast(texto);
  }

  const cargado = dataLoaded ? studio : null;
  const minimo = planMinimoPara('gamificacion');
  const plan = cargado
    ? estadoDelPlan({
      enTuPlan: entitlementsDe(cargado).features.gamificacion,
      activo: accesoProducto(cargado),
      planMinimo: minimo ? PLAN_INFO[minimo].nombre : null,
    })
    : null;
  // Sin cargar no se tapa nada: un bloqueo que parpadea y se va miente.
  const sinPlan = !!cargado && !tieneFeature(cargado, 'gamificacion');
  const conPlan = (hijos: ReactNode) => (sinPlan ? <PlanGate studio={cargado ?? {}} feature="gamificacion">{hijos}</PlanGate> : hijos);

  const filaRecompensas = {
    id: 'recompensas-y-logros' as const,
    valor: resumenHerramienta('recompensas-y-logros', {
      motivacion: gamificacionCargada
        ? { recompensas: rewardCatalog.length, logros: achievementDefinitions.length, niveles: levelDefinitions.length, retos: challengeDefinitions.length }
        : null,
    }),
  };

  return (
    <>
      <GrupoFilas titulo="Tus créditos">
        <FilaAjuste id="reglas" icono={Coins} valor={cargado ? resumenReglasCreditos(cargado) : null} estado={plan} onAbrir={abrir} />
        <FilaAjuste
          id="creditos-por-accion"
          icono={Sparkles}
          valor={resumenCreditosPorAccion(gamificacionCargada ? rewardRules : null, DISPARADORES, nombreCreditos(cargado?.creditosNombre))}
          estado={plan}
          onAbrir={abrir}
        />
      </GrupoFilas>

      <GrupoFilas titulo="Lo que ven en su app">
        <FilaHerramienta {...filaRecompensas} estado={plan} />
      </GrupoFilas>

      <CajonAjuste id="reglas" abierto={cajon === 'reglas'} onCerrar={cerrar}>
        {conPlan(<FormReglasCreditos onGuardado={guardado} />)}
      </CajonAjuste>
      <CajonAjuste id="creditos-por-accion" abierto={cajon === 'creditos-por-accion'} onCerrar={cerrar}>
        {conPlan(<FormCreditosPorAccion onGuardado={guardado} />)}
      </CajonAjuste>
    </>
  );
}

// La fila de `suscripciones` que entrega una línea de PLAN vendida en el TPV.
//
// ⚠️ Una CUOTA vendida en el mostrador nacía SIN fecha de fin y no se renovaba
// nunca. `entregarVentaPOS` calculaba `fecha_fin = calcularFechaFinBono(hoy,
// plan.validez_dias)`, que es la cuenta de un BONO. Una cuota (`MENSUAL`, y
// también trimestral o anual vía `periodicidad_meses`) tiene `validez_dias`
// NULL por definición, así que la fecha salía NULL. El cron de renovaciones
// filtra `fecha_fin is not null`, y el resultado era una cuota cobrada una vez
// en el mostrador y una socia reservando gratis para siempre, pagara con lo
// que pagara.
//
// Es el mismo bug que `cicloInicialDe` (lib/bono-logic.ts) arregló el 5-sep en
// los otros cuatro caminos de alta. El TPV se quedó fuera. Aquí se usa esa
// misma función, y en un fichero aparte para poder probarlo: `venta-servidor.ts`
// arrastra imports con alias `@/` que `node --test` no resuelve.

import { cicloInicialDe } from '../bono-logic.ts';
import type { PlanTarifa } from '../types.ts';

/** Lo que `entregarVentaPOS` lee de `planes_tarifa` (nombres de columna). */
export interface PlanDeLinea {
  id: string;
  tipo: string;
  sesiones: number | null;
  validez_dias: number | null;
  periodicidad_meses: number | null;
}

export function filaSuscripcionDeLinea(
  plan: PlanDeLinea,
  p: { suscripcionId: string; studioId: string; socioId: string; hoy: string },
) {
  const ciclo = cicloInicialDe(
    {
      tipo: plan.tipo as PlanTarifa['tipo'],
      sesiones: plan.sesiones,
      validezDias: plan.validez_dias,
      periodicidadMeses: plan.periodicidad_meses,
    },
    p.hoy,
  );
  return {
    id: p.suscripcionId,
    studio_id: p.studioId,
    socio_id: p.socioId,
    plan_id: plan.id,
    estado: 'ACTIVA' as const,
    fecha_inicio: p.hoy,
    fecha_fin: ciclo.fechaFin,
    sesiones_restantes: ciclo.sesionesRestantes,
    stripe_subscription_id: null,
  };
}

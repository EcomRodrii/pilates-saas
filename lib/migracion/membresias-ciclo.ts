// Fechas y estado de una membresía/bono al importarla.
//
// Antes el importador guardaba `fecha_fin = NULL` cuando el archivo no traía
// fecha de fin, y NULL significa «no caduca nunca». Un bono de nov-2024 con 180
// días de validez entraba «Activa, quedan 20 de 20» y la ficha lo contaba como
// clienta activa. Aquí se calcula la fecha de fin que le toca por la validez de
// su tarifa (la misma regla que una venta: `cicloInicialDe`) y, si ya pasó, la
// membresía entra como EXPIRADA, sin consumir nada.

import { cicloInicialDe } from '../bono-logic.ts';
import type { PlanTarifa } from '../types.ts';

export interface ResultadoCicloImportado {
  fechaFin: string | null;
  estado: string;
  /** Saldo final: el del archivo; si falta, el del plan solo mientras sigue vigente. */
  sesionesRestantes: number | null;
  /** Se ha dado por caducada por su fecha de fin (para contarlo en el acta). */
  caducada: boolean;
}

export function cicloDeMembresiaImportada(args: {
  plan: Pick<PlanTarifa, 'tipo' | 'sesiones' | 'validezDias'> & Partial<Pick<PlanTarifa, 'periodicidadMeses'>>;
  /** YYYY-MM-DD */
  fechaInicio: string;
  fechaFinArchivo: string | null;
  estadoArchivo: string | null;
  /** Saldo del archivo (null = celda vacía). */
  saldoArchivo: number | null;
  /** Hoy en el día del estudio (YYYY-MM-DD), nunca el de UTC. */
  hoy: string;
}): ResultadoCicloImportado {
  const { plan, fechaInicio, fechaFinArchivo, estadoArchivo, saldoArchivo, hoy } = args;

  // Cuotas (MENSUAL) sin fecha de fin: no se inventa. `cicloInicialDe` daría
  // «inicio + 1 mes», que para una cuota de 2024 ya es pasado y la mataría; la
  // renovación de una cuota importada es otro asunto (lo lleva el cobro).
  const fechaFin = fechaFinArchivo
    ?? (plan.tipo !== 'MENSUAL' ? cicloInicialDe(plan, `${fechaInicio}T12:00:00.000Z`).fechaFin : null);

  const estadoBase = estadoArchivo ?? 'ACTIVA';
  const caducada = estadoBase === 'ACTIVA' && fechaFin !== null && fechaFin < hoy;
  const estado = caducada ? 'EXPIRADA' : estadoBase;

  // Saldo: el del archivo manda. Si falta, el bono vigente entra entero (decisión
  // vieja y documentada en la ruta), pero uno ya caducado no recibe un saldo inventado.
  const saldoPlan = plan.tipo === 'BONO' && !caducada ? plan.sesiones : null;
  const sesionesRestantes = saldoArchivo ?? saldoPlan;

  return { fechaFin, estado, sesionesRestantes, caducada };
}

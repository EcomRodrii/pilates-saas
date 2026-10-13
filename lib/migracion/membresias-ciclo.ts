// Fechas y estado de una membresía/bono al importarla.
//
// Antes el importador guardaba `fecha_fin = NULL` cuando el archivo no traía
// fecha de fin, y NULL significa «no caduca nunca». Un bono de nov-2024 con 180
// días de validez entraba «Activa, quedan 20 de 20» y la ficha lo contaba como
// clienta activa. Aquí se calcula la fecha de fin que le toca por la validez de
// su tarifa (la misma regla que una venta: `cicloInicialDe`) y, si ya pasó, la
// membresía entra como EXPIRADA, sin consumir nada.

import { cicloInicialDe, mesesDeCiclo } from '../bono-logic.ts';
import type { PlanTarifa } from '../types.ts';

export interface ResultadoCicloImportado {
  fechaFin: string | null;
  estado: string;
  /** Saldo final: el del archivo; si falta, el del plan solo mientras sigue vigente. */
  sesionesRestantes: number | null;
  /** Se ha dado por caducada por su fecha de fin (para contarlo en el acta). */
  caducada: boolean;
  /** Cuota a la que se le puso el final de su ciclo vigente: desde ahí se renueva sola. */
  cuotaConRenovacion: boolean;
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

  const estadoBase = estadoArchivo ?? 'ACTIVA';

  // Cuotas (MENSUAL) sin fecha de fin. `cicloInicialDe` daría «inicio + 1 mes»,
  // que para una cuota de 2024 ya es pasado y la mataría; pero dejarla en NULL
  // tampoco vale: la renovación (`renovaciones.ts`) solo mira cuotas con fecha de
  // fin vencida, así que una cuota importada sin ella NO se renovaba nunca. Una
  // cuota ACTIVA que viene sin fecha entra con el final de SU ciclo vigente: el
  // primer aniversario de su inicio que no ha pasado (ciclos de `mesesDeCiclo`).
  // Las pausadas o canceladas no se tocan: no deben renovarse.
  const fechaFin = fechaFinArchivo
    ?? (plan.tipo !== 'MENSUAL'
      ? cicloInicialDe(plan, `${fechaInicio}T12:00:00.000Z`).fechaFin
      : estadoBase === 'ACTIVA' ? finDelCicloVigente(fechaInicio, hoy, mesesDeCiclo(plan)) : null);

  const caducada = estadoBase === 'ACTIVA' && fechaFin !== null && fechaFin < hoy;
  const estado = caducada ? 'EXPIRADA' : estadoBase;

  // Saldo: el del archivo manda. Si falta, el bono vigente entra entero (decisión
  // vieja y documentada en la ruta), pero uno ya caducado no recibe un saldo inventado.
  const saldoPlan = plan.tipo === 'BONO' && !caducada ? plan.sesiones : null;
  const sesionesRestantes = saldoArchivo ?? saldoPlan;

  const cuotaConRenovacion = plan.tipo === 'MENSUAL' && fechaFinArchivo == null && fechaFin !== null;
  return { fechaFin, estado, sesionesRestantes, caducada, cuotaConRenovacion };
}

/** `YYYY-MM-DD` + n meses, sin desbordar al mes siguiente (31-ene + 1 mes = 28/29-feb). */
function sumarMesesISO(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const total = (m - 1) + n;
  const anio = y + Math.floor(total / 12);
  const mes = ((total % 12) + 12) % 12;
  const ultimo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return `${anio}-${String(mes + 1).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

/**
 * El primer final de ciclo (inicio + k·meses, k ≥ 1) que no ha pasado: hasta ahí
 * llega lo ya pagado de una cuota que viene de otra plataforma. Si aún no ha
 * empezado, es el final de su primer ciclo.
 */
export function finDelCicloVigente(fechaInicio: string, hoy: string, meses: number): string {
  const paso = Math.max(1, meses);
  let k = 1;
  let fin = sumarMesesISO(fechaInicio, paso);
  while (fin < hoy && k < 1200) {
    k++;
    fin = sumarMesesISO(fechaInicio, paso * k);
  }
  return fin;
}

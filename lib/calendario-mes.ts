// ─────────────────────────────────────────────────────────────────────────────
// Vista de Mes (Fase 2 del calendario) — agregación por día, no por hora.
// Puro: no sabe nada de React. `pideAtencion` llega ya calculado por el
// llamador vía `pideDecision()` (calendario-estado.ts) — no se reimplementa
// esa regla aquí, igual que ya hace `prepararColumnasSalaDia`.
// ─────────────────────────────────────────────────────────────────────────────

import { ratioOcupacion } from './ocupacion.ts';

export interface SesionMes {
  id: string;
  /** yyyy-mm-dd LOCAL (mismo formato que localDate() en page.tsx). */
  fecha: string;
  confirmadas: number;
  aforoMaximo: number;
  cancelada: boolean;
  pideAtencion: boolean;
}

export interface DiaMes {
  fecha: string;
  nClases: number;
  /** 0..1, media de ocupación de las clases de ese día. 0 si no hay clases. */
  ocupacionMedia: number;
  hayAtencion: boolean;
}

// Las canceladas no cuentan para ocupación ni para el recuento de clases del
// día — mismo criterio que ya usa metricasSemana/prepararColumnasSalaDia.
// Un día sin sesiones (todas canceladas o ninguna) simplemente no aparece en
// el Map — el llamador decide cómo rellenar los huecos.
export function agregarPorDiaMes(sesiones: SesionMes[]): Map<string, DiaMes> {
  const porDia = new Map<string, SesionMes[]>();
  for (const s of sesiones) {
    if (s.cancelada) continue;
    const arr = porDia.get(s.fecha) ?? [];
    arr.push(s);
    porDia.set(s.fecha, arr);
  }

  const resultado = new Map<string, DiaMes>();
  for (const [fecha, arr] of porDia) {
    const ratios = arr.map(s => ratioOcupacion(s.confirmadas, s.aforoMaximo));
    resultado.set(fecha, {
      fecha,
      nClases: arr.length,
      ocupacionMedia: ratios.reduce((a, b) => a + b, 0) / ratios.length,
      hayAtencion: arr.some(s => s.pideAtencion),
    });
  }
  return resultado;
}

'use client';

import type { ResumenAPI } from './use-decisiones';

// Resumen ejecutivo (Bible doc 4): el saludo ya viene redactado por el
// Director (motor.ts + redaccion.ts) — este componente solo lo presenta,
// nunca recalcula ni reinterpreta los números.
//
// A propósito, SIN Card ni badge de estado (EXCELENTE/ATENCIÓN/ACCIÓN
// INMEDIATA ya no se pintan aquí): el Veredicto del día (VeredictoDelDia) es
// el único titular con jerarquía de hero de la pantalla — un segundo hero
// con su propio semáforo, justo debajo, duplicaba su trabajo y devolvía el
// vocabulario de "estado general" que el Umbral existe para evitar.
export function ExecutiveSummary({ resumen }: { resumen: ResumenAPI }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[14px] font-medium text-foreground">{resumen.saludo}</p>
      {resumen.nDecisiones > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
          <span>
            Tiempo estimado ·{' '}
            <strong className="font-semibold text-foreground">{resumen.tiempoEstimadoMin} min</strong>
          </span>
          {resumen.impactoTotal && resumen.impactoTotal.valor > 0 && (
            <span>
              Impacto potencial estimado ·{' '}
              <strong className="font-semibold text-foreground">+{resumen.impactoTotal.valor}€/mes</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ResumenAPI } from './use-decisiones';

// Resumen ejecutivo (Bible doc 4): el saludo ya viene redactado por el
// Director (motor.ts + redaccion.ts) — este componente solo lo presenta,
// nunca recalcula ni reinterpreta los números.
const ESTADO_INFO: Record<ResumenAPI['estadoGeneral'], { label: string; color: string; bg: string }> = {
  EXCELENTE: { label: 'Excelente', color: '#059669', bg: '#ECFDF5' },
  ATENCION: { label: 'Atención', color: '#D97706', bg: '#FFFBEB' },
  ACCION_INMEDIATA: { label: 'Acción inmediata', color: '#DC2626', bg: '#FEF2F2' },
};

export function ExecutiveSummary({ resumen }: { resumen: ResumenAPI }) {
  const estado = ESTADO_INFO[resumen.estadoGeneral];

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <p className="font-heading text-[20px] leading-snug font-semibold text-foreground">
            {resumen.saludo}
          </p>
          <Badge style={{ backgroundColor: estado.bg, color: estado.color }} className="shrink-0">
            {estado.label}
          </Badge>
        </div>

        {resumen.nDecisiones > 0 && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-muted-foreground">
            <span>
              Tiempo estimado <strong className="font-semibold text-foreground">{resumen.tiempoEstimadoMin} min</strong>
            </span>
            {resumen.impactoTotal && resumen.impactoTotal.valor > 0 && (
              <span>
                Impacto económico{' '}
                <strong className="font-semibold text-foreground">+{resumen.impactoTotal.valor}€/mes</strong>
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

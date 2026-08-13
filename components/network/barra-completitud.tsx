'use client';

import { cn } from '@/lib/utils';

// Deliberadamente sin ningún icono de verificación cerca — completitud y
// verificación son dos conceptos distintos (docs/NETWORK-AUDIT.md riesgo #3):
// esto solo dice "¿has rellenado tu perfil?", nunca "¿alguien lo ha confirmado?".
export function BarraCompletitud({ porcentaje }: { porcentaje: number }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[12px] font-medium text-foreground">Tu perfil está al {porcentaje}%</p>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full bg-brand transition-all', porcentaje === 100 && 'bg-success')}
          style={{ width: `${porcentaje}%` }}
        />
      </div>
    </div>
  );
}

import { Card, CardContent } from '@/components/ui/card';
import type { RecomendacionAPI } from './use-decisiones';

// Seguimiento (reorganización Centro de Control §2): situaciones PENDIENTE
// que ya existían desde un día anterior y son de prioridad MEDIA/BAJA — se
// parten de `masSituaciones` con `partirMasSituaciones` (lib/decision/
// prioridad.ts), nunca se recalculan. Es la MISMA fila que su especialista
// cuenta en "Tu equipo y tu cartera" y que, si volviera a ser urgente,
// aparecería en Prioridades — nunca una tarjeta completa duplicada aquí Y
// allí a la vez.
//
// Distinto del antiguo "círculo de aprendizaje" (outcomes ya medidos,
// "Seguiste esto: X. Funcionó") — ese concepto se reubicó dentro de
// Actividad, porque es historial de una decisión ya tomada, no algo
// pendiente de criterio.
export function SeguimientoPendiente({ items }: { items: RecomendacionAPI[] }) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-heading text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        Seguimiento
      </h2>
      <div className="flex flex-col gap-2">
        {items.map(r => (
          <Card key={r.id} size="sm">
            <CardContent className="flex items-center gap-2">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--muted-foreground)' }} />
              <p className="text-[13px] text-foreground">
                {r.titulo}. <span className="text-muted-foreground">Sin cambios claros desde la última revisión.</span>
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

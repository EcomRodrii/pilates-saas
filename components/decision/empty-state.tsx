'use client';

import { Card, CardContent } from '@/components/ui/card';

// Modo aprendizaje (Bible doc 5 §20, Núcleo §9): pantalla mientras NO existe
// todavía ningún `resumen_diario` persistido para este estudio — el gate real
// es "¿ha corrido ya el primer análisis?", no "¿cuántas semanas de historial
// hay?" (P2-5: decisionDispatcher, lib/inngest/decision.ts, no filtra por
// antigüedad — corre para CUALQUIER estudio elegible dos veces al día, y
// "Analizar ahora" lo dispara al instante). El copy anterior prometía
// "unas semanas", algo que el sistema no exige ni cumple — se corrige para
// no generar una expectativa falsa. Nunca "no hay datos" — siempre acompaña
// con qué hacer mientras tanto.
export function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="font-heading text-[17px] font-semibold text-foreground">
          Aún estoy conociendo tu estudio
        </p>
        <p className="max-w-sm text-[14px] text-muted-foreground">
          Todavía no he hecho mi primer análisis del día. Pulsa &quot;Analizar
          ahora&quot; arriba para verlo ya, o vuelve más tarde. Mientras tanto
          puedes:
        </p>
        <div className="flex flex-col items-start gap-1.5 pt-1 text-[13px] text-foreground">
          <span>✓ Crear una clase</span>
          <span>✓ Añadir alumnas</span>
          <span>✓ Registrar pagos</span>
        </div>
      </CardContent>
    </Card>
  );
}

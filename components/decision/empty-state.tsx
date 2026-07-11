'use client';

import { Card, CardContent } from '@/components/ui/card';

// Modo aprendizaje (Bible doc 5 §20, Núcleo §9): estudio nuevo o con historial
// insuficiente. Nunca "no hay datos" — siempre acompaña con qué hacer mientras tanto.
export function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="font-heading text-[17px] font-semibold text-foreground">
          Aún estoy conociendo tu estudio
        </p>
        <p className="max-w-sm text-[14px] text-muted-foreground">
          Necesito unas semanas de datos para empezar a darte recomendaciones fiables.
          Mientras tanto puedes:
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

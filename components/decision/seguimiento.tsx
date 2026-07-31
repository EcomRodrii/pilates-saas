import { Card, CardContent } from '@/components/ui/card';
import type { SeguimientoAPI } from './use-decisiones';

// El círculo de aprendizaje: no basta con decidir cuándo hablar, hay que
// demostrar que las decisiones fueron acertadas. Reutiliza
// recomendacion_outcomes (ya existente, medido por lib/inngest/decision.ts
// F4) — aquí solo se enseña. Incluye NEGATIVO a propósito, con tono humilde:
// el Umbral admite cuando no acertó, no solo presume cuando sí.

function frase(s: SeguimientoAPI): string {
  if (s.outcome === 'POSITIVO') return `Seguiste esto: ${s.titulo}. Funcionó.`;
  if (s.outcome === 'NEGATIVO') return `La última vez no acerté con esto: ${s.titulo}.`;
  return `Seguiste esto: ${s.titulo}. Sin cambios claros.`;
}

export function Seguimiento({ items }: { items: SeguimientoAPI[] }) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-heading text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        Seguimiento
      </h2>
      <div className="flex flex-col gap-2">
        {items.map((s, i) => (
          <Card key={i} size="sm">
            <CardContent className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: s.outcome === 'NEGATIVO' ? 'var(--warning)' : 'var(--success)' }}
              />
              <p className="text-[13px] text-foreground">{frase(s)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

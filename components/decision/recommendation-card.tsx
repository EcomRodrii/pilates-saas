'use client';

import { Clock, Check, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ImpactoAPI, RecomendacionAPI } from './use-decisiones';

// Plantilla única de recomendación (Bible doc 5 §14 / doc 3): título → motivo
// → impacto → confianza → tiempo → acción. Nunca cambia de orden entre
// especialistas — es lo que hace la interfaz predecible (doc 5 regla de oro 12).

const CONFIANZA_LABEL: Record<string, string> = {
  ALTA: 'Confianza alta',
  MEDIA: 'Confianza media',
  BAJA: 'Confianza baja',
};

function formatearImpacto(imp: ImpactoAPI | null): string | null {
  if (!imp || imp.valor === 0) return null;
  const signo = imp.valor >= 0 ? '+' : '';
  if (imp.unidad === 'EUR_MES') return `${signo}${imp.valor}€/mes`;
  if (imp.unidad === 'EUR') return `${signo}${imp.valor}€`;
  return `${signo}${imp.valor}%`;
}

export function RecommendationCard({ recomendacion, onAprobar, onRechazar, procesando }: {
  recomendacion: RecomendacionAPI;
  onAprobar: () => void;
  onRechazar: () => void;
  procesando?: boolean;
}) {
  const impactoTexto = formatearImpacto(recomendacion.impacto);
  const esCritica = recomendacion.prioridad === 'CRITICA';

  return (
    <Card style={esCritica ? { boxShadow: '0 0 0 1px #FCA5A5' } : undefined}>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-heading text-[16px] leading-snug font-semibold text-foreground">
            {recomendacion.titulo}
          </h3>
          {impactoTexto && (
            <span
              className="shrink-0 text-[15px] font-bold"
              style={{ color: recomendacion.riesgo === 'PERDIDA' ? 'var(--foreground)' : '#059669' }}
            >
              {impactoTexto}
            </span>
          )}
        </div>

        <p className="text-[14px] leading-relaxed text-muted-foreground">{recomendacion.motivo}</p>

        <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock size={12} /> {recomendacion.tiempoEstimadoMin} min
          </span>
          <span aria-hidden>·</span>
          <span title={recomendacion.confianza.evidencia.join(' · ')}>{CONFIANZA_LABEL[recomendacion.confianza.nivel]}</span>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={onAprobar} disabled={procesando}>
            <Check size={14} /> Aprobar
          </Button>
          <Button size="sm" variant="outline" onClick={onRechazar} disabled={procesando}>
            <X size={14} /> Descartar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

'use client';

import { useState } from 'react';
import { Clock, Check, X, MessageCircle, ChevronDown, TriangleAlert } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ESPECIALISTA_INFO } from './especialista-info';
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

export function RecommendationCard({ recomendacion, onAprobar, onRechazar, procesando, whatsappHref }: {
  recomendacion: RecomendacionAPI;
  onAprobar: () => void;
  onRechazar: () => void;
  procesando?: boolean;
  whatsappHref?: string | null;
}) {
  const [porQueAbierto, setPorQueAbierto] = useState(false);
  const impactoTexto = formatearImpacto(recomendacion.impacto);
  const esCritica = recomendacion.prioridad === 'CRITICA';
  const especialista = ESPECIALISTA_INFO[recomendacion.especialista];
  // P2-5: cuando detectarConflictos (lib/decision/conflictos.ts) marca dos
  // recomendaciones de especialistas distintos que se contradicen, lo anota
  // en datosUsados.conflictoCon en vez de ocultar ninguna — aquí es donde
  // ese aviso se hace visible por primera vez, para que la propietaria elija
  // ella en vez de que el sistema decida en silencio.
  const conflictoCon = typeof recomendacion.datosUsados.conflictoCon === 'string' ? recomendacion.datosUsados.conflictoCon : null;

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
              style={{ color: recomendacion.riesgo === 'PERDIDA' ? 'var(--foreground)' : 'var(--success)' }}
            >
              {impactoTexto}
            </span>
          )}
        </div>

        <p className="text-[14px] leading-relaxed text-muted-foreground">{recomendacion.motivo}</p>

        {conflictoCon && (
          <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-[12px]" style={{ backgroundColor: 'color-mix(in srgb, var(--warning) 12%, var(--card))', color: 'var(--warning)' }}>
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>Puede chocar con otra recomendación: {conflictoCon}</span>
          </div>
        )}

        <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
          {especialista && <span>{especialista.nombre}</span>}
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Clock size={12} /> {recomendacion.tiempoEstimadoMin} min
          </span>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={() => setPorQueAbierto(v => !v)}
            className="inline-flex items-center gap-1 hover:text-foreground"
            aria-expanded={porQueAbierto}
          >
            {CONFIANZA_LABEL[recomendacion.confianza.nivel]}
            <ChevronDown size={12} className={porQueAbierto ? 'rotate-180' : ''} />
          </button>
        </div>

        {porQueAbierto && recomendacion.confianza.evidencia.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-lg bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
            {recomendacion.confianza.evidencia.map((e, i) => <li key={i}>· {e}</li>)}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" onClick={onAprobar} disabled={procesando}>
            <Check size={14} /> Aprobar
          </Button>
          {whatsappHref && (
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="inline-flex">
              <Button size="sm" variant="outline" type="button" tabIndex={-1}>
                <MessageCircle size={14} /> WhatsApp
              </Button>
            </a>
          )}
          <Button size="sm" variant="outline" onClick={onRechazar} disabled={procesando}>
            <X size={14} /> Descartar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

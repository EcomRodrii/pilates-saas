'use client';

import { useState } from 'react';
import { Clock, Check, X, Mail, Euro, MessageCircle, ChevronDown, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ESPECIALISTA_INFO } from './especialista-info';
import { etiquetaImpacto, fraseConfianza } from '@/lib/decision/copy';
import { severidad } from './severidad';
import { SeveridadBadge } from './severidad-badge';
import type { ImpactoAPI, RecomendacionAPI } from './use-decisiones';

// Reorganización Centro de Control §3 (PR3): sustituye a RecommendationCard +
// SeguimientoPendiente — una sola lista de situaciones abiertas, en vez de
// dos grids con 5 encabezados de sección para lo que conceptualmente es una
// sola cosa. El orden lo decide `page.tsx` concatenando en bloques fijos
// (Prioridades → Más situaciones nuevas → Seguimiento) — nunca un re-sort
// por score aquí, o se deshace el cap de especialista/críticas que
// `lib/decision/prioridad.ts` ya aplicó a propósito en el servidor.
//
// `variante` decide cuánto pesa visualmente la fila: 'completo' es
// accionable (motivo, evidencia, botones); 'seguimiento' es deliberadamente
// menos — sin botones ni badge de severidad, para no generar fatiga de
// decisión sobre algo que lleva días sin cambiar (mismo principio que ya
// tenía SeguimientoPendiente).
function formatearImpacto(imp: ImpactoAPI | null, riesgo: 'PERDIDA' | 'OPORTUNIDAD', tipo: string): { etiqueta: string; cifra: string } | null {
  if (!imp || imp.valor === 0) return null;
  const signo = imp.valor >= 0 ? '+' : '';
  const cifra = imp.unidad === 'EUR_MES' ? `${signo}${imp.valor}€/mes`
    : imp.unidad === 'EUR' ? `${signo}${imp.valor}€`
    : `${signo}${imp.valor}%`;
  return { etiqueta: etiquetaImpacto(riesgo, tipo as Parameters<typeof etiquetaImpacto>[1]), cifra };
}

// Botón principal específico por tipo, no un "Hecho" genérico siempre —
// aprobar() ejecuta de verdad (app/api/decisiones/[id]/aprobar/route.ts →
// DECISION_APPROVED), y para COBRAR_RECIBOS eso es cobrar una tarjeta real:
// el botón tiene que decir lo que va a pasar, no un genérico que oculte que
// mueve dinero.
function botonPrincipal(tipo: string): { label: string; Icon: typeof Check } {
  if (tipo === 'COBRAR_RECIBOS') return { label: 'Cobrar ahora', Icon: Euro };
  if (tipo === 'ENVIAR_EMAIL') return { label: 'Enviar email', Icon: Mail };
  return { label: 'Hecho', Icon: Check };
}

type Props =
  | {
      variante: 'completo';
      recomendacion: RecomendacionAPI;
      onAprobar: () => void;
      onRechazar: () => void;
      procesando?: boolean;
      whatsappHref?: string | null;
    }
  | {
      variante: 'seguimiento';
      recomendacion: RecomendacionAPI;
      /** Días naturales desde `creadoEn` — `partirMasSituaciones` ya
       * garantiza que es ≥1 para todo lo que llega aquí como seguimiento. */
      diasAbierta: number;
    };

export function FilaSituacion(props: Props) {
  const { recomendacion: r } = props;
  const [porQueAbierto, setPorQueAbierto] = useState(false);

  if (props.variante === 'seguimiento') {
    return (
      <Card size="sm">
        <CardContent className="flex items-center gap-2">
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--muted-foreground)' }} />
          <p className="text-[13px] text-foreground">
            {r.titulo}. <span className="text-muted-foreground">
              Sin cambios claros desde la última revisión · abierto hace {props.diasAbierta} {props.diasAbierta === 1 ? 'día' : 'días'}.
            </span>
          </p>
        </CardContent>
      </Card>
    );
  }

  const { onAprobar, onRechazar, procesando, whatsappHref } = props;
  const impacto = formatearImpacto(r.impacto, r.riesgo, r.tipo);
  const esCritica = r.prioridad === 'CRITICA';
  const nivelSev = severidad(r.prioridad, r.riesgo, r.confianza.nivel);
  const { label: labelPrincipal, Icon: IconPrincipal } = botonPrincipal(r.accion.tipo);
  const especialista = ESPECIALISTA_INFO[r.especialista];
  // P2-5: cuando detectarConflictos (lib/decision/conflictos.ts) marca dos
  // recomendaciones de especialistas distintos que se contradicen, lo anota
  // en datosUsados.conflictoCon en vez de ocultar ninguna.
  const conflictoCon = typeof r.datosUsados.conflictoCon === 'string' ? r.datosUsados.conflictoCon : null;

  return (
    <Card className={esCritica ? 'ring-2 ring-destructive/40' : undefined}>
      <CardContent className="flex flex-col gap-3">
        <SeveridadBadge nivel={nivelSev} />

        <div className="flex items-start justify-between gap-3">
          <h3 className="font-heading text-[16px] leading-snug font-semibold text-foreground">
            {r.titulo}
          </h3>
          {impacto && (
            <div className="shrink-0 text-right">
              <span
                className="text-[15px] font-bold"
                style={{ color: r.riesgo === 'PERDIDA' ? 'var(--foreground)' : 'var(--success)' }}
              >
                {impacto.cifra}
              </span>
              <p className="text-[10.5px] leading-tight text-muted-foreground">{impacto.etiqueta}</p>
            </div>
          )}
        </div>

        <p className="text-[14px] leading-relaxed text-muted-foreground">{r.motivo}</p>

        {conflictoCon && (
          <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-[12px]" style={{ backgroundColor: 'color-mix(in srgb, var(--warning) 12%, var(--card))', color: 'var(--warning)' }}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>Puede chocar con otra recomendación: {conflictoCon}</span>
          </div>
        )}

        <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
          {especialista && <span>{especialista.nombre}</span>}
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Clock size={12} /> {r.tiempoEstimadoMin} min
          </span>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={() => setPorQueAbierto(v => !v)}
            className="inline-flex items-center gap-1 hover:text-foreground"
            aria-expanded={porQueAbierto}
          >
            {fraseConfianza(r.confianza.nivel)}
            <ChevronDown size={12} className={porQueAbierto ? 'rotate-180' : ''} />
          </button>
        </div>

        {porQueAbierto && r.confianza.evidencia.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-lg bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
            {r.confianza.evidencia.map((e, i) => <li key={i}>· {e}</li>)}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" onClick={onAprobar} disabled={procesando}>
            <IconPrincipal size={14} /> {labelPrincipal}
          </Button>
          {whatsappHref && (
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="inline-flex">
              <Button size="sm" variant="outline" type="button" tabIndex={-1}>
                <MessageCircle size={14} /> WhatsApp
              </Button>
            </a>
          )}
          <Button size="sm" variant="outline" onClick={onRechazar} disabled={procesando}>
            <X size={14} /> Ya lo sé
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

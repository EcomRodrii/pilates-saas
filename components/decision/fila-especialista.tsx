'use client';

import { Badge } from '@/components/ui/badge';
import { ESPECIALISTA_INFO } from './especialista-info';
import { ESTADO_ESPECIALISTA_INFO } from '@/lib/decision/severidad';
import type { PorEspecialistaAPI } from './use-decisiones';

// Reorganización Centro de Control §4 (PR4): sustituye a SpecialistCard.
// "Mi Equipo" era un grid de hasta 8 Cards — con 6+ diciendo casi siempre
// "Nada que proponerte hoy", puro peso visual por repetición de layout, no
// por contenido. Misma información, fila de una línea en vez de tarjeta.
//
// Las 8 filas SIEMPRE se ven, nunca filtradas a pendientes>0 ni resumidas
// ("+6 especialistas sin nada que proponer"): es justo el bug que arregló
// P2-5 (un especialista en verde solo dice que sus reglas no encontraron
// nada, no que esa parte del negocio va bien — un semáforo que se pudiera
// ocultar en verde deja de mirarse). El texto de "N situaciones
// pendientes"/"Nada que proponerte hoy." se mantiene literal
// (e2e/centro-control-especialistas.spec.ts lo comprueba con toHaveCount).
export function FilaEspecialista({ data }: { data: PorEspecialistaAPI }) {
  const info = ESPECIALISTA_INFO[data.especialista];
  if (!info) return null;
  const estado = ESTADO_ESPECIALISTA_INFO[data.estado];
  const Icon = info.icon;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-3 py-2.5 hover:bg-muted/50">
      <Icon size={16} className="shrink-0 text-muted-foreground" />
      <span className="text-[13px] font-semibold text-foreground">Especialista en {info.nombre}</span>
      <Badge style={{ backgroundColor: estado.bg, color: estado.color }} className="shrink-0">
        {estado.label}
      </Badge>
      <span className="text-[12px] text-muted-foreground">
        {data.pendientes === 0
          ? 'Nada que proponerte hoy.'
          : `${data.pendientes} ${data.pendientes === 1 ? 'situación pendiente' : 'situaciones pendientes'}.`}
      </span>
      {data.impactoTotal && (
        <span className="text-[12px] font-semibold text-foreground">
          {data.impactoTotal.valor >= 0 ? '+' : ''}{data.impactoTotal.valor}€/mes
        </span>
      )}
      {data.pendientes > 0 && (
        <a href="#recomendaciones" className="ml-auto shrink-0 text-[12px] font-semibold" style={{ color: 'var(--brand-secondary)' }}>
          Revisar
        </a>
      )}
    </div>
  );
}

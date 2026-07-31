'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ESPECIALISTA_INFO } from './especialista-info';
import type { PorEspecialistaAPI } from './use-decisiones';

// "Mi Equipo" (Bible doc 4/doc 3): cada especialista es una tarjeta con
// estado, trabajo pendiente e impacto — nunca gráficos.

const ESTADO_INFO: Record<PorEspecialistaAPI['estado'], { label: string; color: string; bg: string }> = {
  // 'EXCELENTE' lo emite el director cuando hay CERO recomendaciones
  // pendientes (lib/decision/director.ts), que no es lo mismo que "el negocio
  // va excelente": la etiqueta se ajusta a lo que el dato significa.
  EXCELENTE: { label: 'Al día', color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 12%, var(--card))' },
  BUENO: { label: 'Bueno', color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 12%, var(--card))' },
  ATENCION: { label: 'Atención', color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 12%, var(--card))' },
  CRITICO: { label: 'Crítico', color: 'var(--destructive)', bg: 'color-mix(in srgb, var(--destructive) 12%, var(--card))' },
};

export function SpecialistCard({ data }: { data: PorEspecialistaAPI }) {
  const info = ESPECIALISTA_INFO[data.especialista];
  if (!info) return null;
  const estado = ESTADO_INFO[data.estado];
  const Icon = info.icon;

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Icon size={16} className="shrink-0 text-muted-foreground" />
            <span className="text-[13px] font-semibold text-foreground truncate">Especialista en {info.nombre}</span>
          </div>
          <Badge style={{ backgroundColor: estado.bg, color: estado.color }} className="shrink-0">
            {estado.label}
          </Badge>
        </div>

        {/* "Todo en orden" afirmaba más de lo que el sistema sabe: un
            especialista en verde solo significa que SUS reglas no han
            encontrado nada que proponer, no que esa parte del negocio esté
            bien. Con cero recomendaciones pendientes se decía "Todo en orden"
            en un estudio con cero ingresos, y un semáforo que siempre está
            verde deja de mirarse. Ahora dice exactamente lo que ha pasado. */}
        <p className="text-[13px] text-muted-foreground">
          {data.pendientes === 0
            ? 'Nada que proponerte hoy.'
            : `${data.pendientes} ${data.pendientes === 1 ? 'situación pendiente' : 'situaciones pendientes'}.`}
        </p>

        {data.impactoTotal && (
          <p className="text-[16px] font-bold text-foreground">
            {data.impactoTotal.valor >= 0 ? '+' : ''}{data.impactoTotal.valor}€/mes
          </p>
        )}

        {data.pendientes > 0 && (
          <a href="#recomendaciones" className="text-[12px] font-semibold" style={{ color: 'var(--brand-secondary)' }}>
            Revisar
          </a>
        )}
      </CardContent>
    </Card>
  );
}

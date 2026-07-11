'use client';

import { Card, CardContent } from '@/components/ui/card';
import type { ActividadAPI } from './use-decisiones';

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'ahora';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// Actividad reciente (Bible doc 4): máximo 10 elementos, ya acotado por la API.
export function ActivityList({ items }: { items: ActividadAPI[] }) {
  if (items.length === 0) return null;

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <h3 className="pb-1 font-heading text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Actividad
        </h3>
        <ul className="flex flex-col divide-y divide-border">
          {items.slice(0, 10).map(a => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-[13px] text-foreground">
              <span className="truncate">{a.texto}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(a.creadoEn)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

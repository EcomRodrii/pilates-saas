'use client';

// Gráficos ligeros en SVG (sin dependencias externas). Se adaptan al tema
// mediante currentColor / tokens y traen animación de entrada suave.

import { useId } from 'react';
import { cn } from '@/lib/utils';

export interface SerieLinea {
  nombre: string;
  color: string;
  valores: number[];
}

// Gráfico de líneas/área con eje X por etiquetas y rejilla suave.
export function LineChart({
  series, labels, height = 220, area = true, className,
}: {
  series: SerieLinea[];
  labels: string[];
  height?: number;
  area?: boolean;
  className?: string;
}) {
  const gid = useId().replace(/:/g, '');
  const W = 640, H = height, padL = 8, padR = 8, padT = 12, padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const todos = series.flatMap((s) => s.valores);
  const max = Math.max(1, ...todos);
  const min = Math.min(0, ...todos);
  const rango = max - min || 1;
  const n = labels.length;

  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - ((v - min) / rango) * innerH;

  function path(vals: number[]): string {
    return vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  }

  const gridY = [0, 0.25, 0.5, 0.75, 1].map((f) => padT + innerH - f * innerH);
  const labelStep = Math.ceil(n / 6);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn('w-full', className)} preserveAspectRatio="none" style={{ height }}>
      <defs>
        {series.map((s, si) => (
          <linearGradient key={si} id={`${gid}-g${si}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>

      {gridY.map((gy, i) => (
        <line key={i} x1={padL} y1={gy} x2={W - padR} y2={gy} stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" />
      ))}

      {series.map((s, si) => (
        <g key={si}>
          {area && (
            <path
              d={`${path(s.valores)} L ${x(n - 1)} ${padT + innerH} L ${x(0)} ${padT + innerH} Z`}
              fill={`url(#${gid}-g${si})`}
            >
              <animate attributeName="opacity" from="0" to="1" dur="0.5s" fill="freeze" />
            </path>
          )}
          <path d={path(s.valores)} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: 0, animation: 'lp-dash 0.7s ease forwards' }} />
        </g>
      ))}

      {labels.map((l, i) => (i % labelStep === 0 || i === n - 1) ? (
        <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.5">{l}</text>
      ) : null)}
    </svg>
  );
}

// Barras horizontales para comparativas (ej. entre redes).
export function BarList({
  items, className,
}: {
  items: { label: string; value: number; color: string; sub?: string }[];
  className?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className={cn('space-y-3', className)}>
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-3">
          <span className="w-20 text-[12px] font-semibold text-foreground truncate shrink-0">{it.label}</span>
          <div className="flex-1 h-6 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full flex items-center justify-end px-2 transition-[width] duration-500"
              style={{ width: `${Math.max(6, (it.value / max) * 100)}%`, background: it.color }}
            >
              <span className="text-[10px] font-bold text-white/95 tabular-nums">{it.value.toLocaleString('es-ES')}</span>
            </div>
          </div>
          {it.sub && <span className="w-14 text-right text-[11px] text-muted-foreground tabular-nums shrink-0">{it.sub}</span>}
        </div>
      ))}
    </div>
  );
}

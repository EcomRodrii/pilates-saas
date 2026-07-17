'use client';

// Primitivas de UI compartidas por el módulo de Contenido. Reutilizan los
// tokens de tema del panel (bg-card, border-border, text-foreground…) para
// mantener el look premium del SaaS.

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  PLATAFORMA_META, ESTADO_META, TIPO_PUBLICACION_LABEL,
  type Plataforma, type EstadoPublicacion, type TipoPublicacion,
} from '@/lib/contenido/types';

export function PageHeader({
  title, subtitle, actions,
}: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function PlataformaAvatar({ plataforma, size = 22 }: { plataforma: Plataforma; size?: number }) {
  const m = PLATAFORMA_META[plataforma];
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-white font-bold shrink-0"
      style={{ background: m.color, width: size, height: size, fontSize: size * 0.4 }}
      title={m.label}
    >
      {m.abbr}
    </span>
  );
}

export function PlataformasStack({ plataformas, size = 22 }: { plataformas: Plataforma[]; size?: number }) {
  return (
    <span className="flex items-center" style={{ paddingLeft: 3 }}>
      {plataformas.map((p, i) => (
        <span key={p} style={{ marginLeft: i === 0 ? -3 : -6, zIndex: plataformas.length - i }} className="ring-2 ring-card rounded-full inline-flex">
          <PlataformaAvatar plataforma={p} size={size} />
        </span>
      ))}
    </span>
  );
}

export function EstadoBadge({ estado }: { estado: EstadoPublicacion }) {
  const m = ESTADO_META[estado];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold', m.color)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', m.dot)} />
      {m.label}
    </span>
  );
}

export function TipoBadge({ tipo }: { tipo: TipoPublicacion }) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {TIPO_PUBLICACION_LABEL[tipo]}
    </span>
  );
}

// Indicador verde/rojo de evolución respecto al periodo anterior.
export function DeltaPill({ pct, className }: { pct: number; className?: string }) {
  const up = pct > 0.05;
  const down = pct < -0.05;
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
        up && 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
        down && 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
        !up && !down && 'bg-muted text-muted-foreground',
        className,
      )}
    >
      <Icon className="w-3 h-3" />
      {up ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
}

export function StatCard({
  label, value, delta, icon: Icon, href, accent,
}: {
  label: string;
  value: string;
  delta?: number;
  icon?: React.ElementType;
  href?: string;
  accent?: string;
}) {
  const inner = (
    <div className={cn(
      'bg-card border border-border rounded-3xl p-5 h-full flex flex-col gap-3',
      href && 'transition-colors hover:border-muted-foreground/50',
    )}>
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-muted-foreground">{label}</span>
        {Icon && (
          <span className="w-8 h-8 rounded-full border border-border flex items-center justify-center shrink-0" style={accent ? { color: accent } : undefined}>
            <Icon className="w-4 h-4" />
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-2 mt-auto">
        <span className="text-3xl font-bold text-foreground tabular-nums leading-none">{value}</span>
        {delta !== undefined && <DeltaPill pct={delta} />}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

// ── Formateadores ──────────────────────────────────────────────────────────

export function fmtNum(n: number): string {
  return n.toLocaleString('es-ES', { maximumFractionDigits: 0 });
}
export function fmtCompact(n: number): string {
  if (n >= 1000) return n.toLocaleString('es-ES', { notation: 'compact', maximumFractionDigits: 1 });
  return String(n);
}
export function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
export function fmtFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
export function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

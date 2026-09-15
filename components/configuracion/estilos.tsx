'use client';

import * as React from 'react';
import { useCampoAsociado } from '@/components/ui/use-campo-asociado';
import { cn } from '@/lib/utils';
import type { PlanTarifa, TipoClase } from '@/lib/types';
import { NOMBRE_TIPO_PLAN } from '@/lib/planes/formulario';

// Tokens y piezas compartidas por las pestañas de Configuración (y por las
// pantallas de network y el editor de contenido del portal que reutilizan su
// aspecto). Vivían exportados desde app/(dashboard)/configuracion/page.tsx, y
// cada pestaña importaba de la página que a su vez la carga: un ciclo.

// ─── Design tokens ────────────────────────────────────────────────────────────
export const inputCls =
  'rounded-lg border border-border px-3 py-2 text-[13px] w-full focus:outline-none focus:ring-2 focus:ring-black/10';
export const labelCls = 'text-[12px] font-medium text-foreground block mb-1';
export const btnPrimary =
  'bg-brand text-brand-foreground rounded-lg px-4 py-2 text-[13px] font-medium flex items-center gap-1.5 hover:brightness-95 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
export const btnSecondary =
  'bg-card border border-border rounded-lg px-4 py-2 text-[13px] text-foreground hover:bg-muted transition-colors';
export const cardCls = 'bg-card border border-border rounded-xl';

// ─── Shared micro-components ──────────────────────────────────────────────────

export function Field({
  label,
  description,
  hint,
  children,
}: {
  label: string;
  /**
   * Qué es esto y cómo decidir. Va debajo de la etiqueta y encima del control:
   * se lee ANTES de elegir, no después de haberse equivocado.
   *
   * Existe porque antes este helper solo aceptaba { label, children }, así que
   * no había ni dónde escribir la explicación — y por eso las pestañas de
   * conceptos propios del producto (planes, logros, niveles, retos) acababan
   * pidiendo decisiones sin contar en ningún sitio qué significaban.
   */
  description?: React.ReactNode;
  /** <InfoTip> junto a la etiqueta, para el detalle largo que no cabe aquí. */
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  // La asociación label↔control (htmlFor/id) la resuelve useCampoAsociado
  // (WCAG 1.3.1/4.1.2, aplicado con el mismo barrido en toda la app). Aquí
  // solo se añade encima el hueco de descripción que useCampoAsociado no trae.
  const { htmlFor, control } = useCampoAsociado(children);
  const descAutoId = React.useId();
  const idDesc = description ? `${descAutoId}-desc` : undefined;
  const controlDescrito = idDesc && React.isValidElement(control)
    ? React.cloneElement(control as React.ReactElement<{ 'aria-describedby'?: string }>, { 'aria-describedby': idDesc })
    : control;

  return (
    <div>
      <label htmlFor={htmlFor} className={cn(labelCls, 'flex items-center gap-1.5')}>
        {label}
        {hint}
      </label>
      {description && (
        <p id={idDesc} className="text-xs leading-relaxed text-muted-foreground mb-1.5 text-balance">
          {description}
        </p>
      )}
      {controlDescrito}
    </div>
  );
}

export function Toggle({ on, onChange, ariaLabel, disabled }: { on: boolean; onChange: (v: boolean) => void; ariaLabel?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => { if (!disabled) onChange(!on); }}
      disabled={disabled}
      aria-pressed={on}
      aria-label={ariaLabel}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
        on ? 'bg-primary' : 'bg-muted-foreground/40',
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-card shadow ring-0 transition-transform duration-200',
          on ? 'translate-x-4' : 'translate-x-0'
        )}
      />
    </button>
  );
}

export function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-9 h-9 rounded-lg border border-border cursor-pointer p-0.5 shrink-0"
      />
      <input
        className={cn(inputCls, 'flex-1')}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="#1A1A1A"
        maxLength={7}
      />
    </div>
  );
}

export function ColorSwatch({ color, size = 'md' }: { color: string; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'w-4 h-4 rounded-full' : 'w-6 h-6 rounded-lg';
  return (
    <span
      className={cn(cls, 'inline-block border border-black/10 shrink-0')}
      style={{ backgroundColor: color }}
    />
  );
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

export function TipoPlanBadge({ tipo }: { tipo: PlanTarifa['tipo'] }) {
  const map: Record<string, string> = {
    MENSUAL: 'bg-accent text-accent-foreground',
    BONO: 'bg-info/10 text-info',
    PUNTUAL: 'bg-background text-muted-foreground',
  };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium', map[tipo])}>
      {NOMBRE_TIPO_PLAN[tipo]}
    </span>
  );
}

export function NivelBadge({ nivel }: { nivel: TipoClase['nivel'] }) {
  const map: Record<string, string> = {
    TODOS: 'bg-background text-muted-foreground',
    PRINCIPIANTE: 'bg-success/10 text-success',
    MEDIO: 'bg-warning/10 text-warning',
    AVANZADO: 'bg-destructive/10 text-destructive',
  };
  const labels: Record<string, string> = {
    TODOS: 'Todos',
    PRINCIPIANTE: 'Principiante',
    MEDIO: 'Medio',
    AVANZADO: 'Avanzado',
  };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium', map[nivel])}>
      {labels[nivel]}
    </span>
  );
}

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
//
// ⚠️ Táctil primero. Con el dedo (`pointer: coarse`: móvil y también el iPad de
// recepción, que es `md` o más ancho) los campos miden 44 px y el texto 16 px:
// por debajo de 16 px iOS amplía la página al enfocar un campo y la deja
// descolocada. Con ratón (`pointer: fine`) vuelven a la densidad de escritorio.
// Se usa la variante de media y NO `md:`, porque el iPad es ancho y táctil a la
// vez. El anillo de foco es el token `ring` (se ve en claro y en oscuro); el de
// antes, `black/10`, no se veía en ninguno de los dos.
const FOCO = 'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

// Un botón deshabilitado se tiene que LEER. `disabled:opacity-40` sobre el oliva
// dejaba «Cerrar el centro esos días» a 1,41:1 —gris sobre gris, parecía roto—.
// Con los tokens de «apagado» queda a 4,9:1 en claro y 5,6:1 en oscuro. El
// contorno existe siempre (transparente) para que apagarse no mueva nada.
const APAGADO = 'disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:brightness-100';

// `border-input` y no `border-border`: el contorno de un campo es el de un
// CONTROL y tiene que llegar a 3:1 (WCAG 1.4.11). Con `--border` se quedaba en
// 1,24:1 y los campos vacíos de SEPA no se veían. Dentro de Configuración
// `--input` vale 3,8:1 (claro) / 3,7:1 (oscuro): ver `.config-tactil` en
// globals.css.
export const inputCls =
  `rounded-lg border border-input bg-card px-3 py-2 w-full min-h-11 text-base [@media(pointer:fine)]:min-h-9 [@media(pointer:fine)]:text-[13px] ${FOCO}`;
export const labelCls = 'text-[12px] font-medium text-foreground block mb-1';
export const btnPrimary =
  `bg-brand text-brand-foreground border border-transparent rounded-lg px-4 py-2 text-[13px] font-medium flex items-center gap-1.5 min-h-11 [@media(pointer:fine)]:min-h-9 hover:brightness-95 transition-colors ${APAGADO} ${FOCO}`;
export const btnSecondary =
  `bg-card border border-border rounded-lg px-4 py-2 text-[13px] text-foreground min-h-11 [@media(pointer:fine)]:min-h-9 hover:bg-muted transition-colors ${APAGADO} ${FOCO}`;
// La sombra ayuda al borde a despegar la tarjeta del fondo sin oscurecerlo más:
// una tarjeta agrupa, no es un control, y no debe pesar como un campo.
export const cardCls = 'bg-card border border-border rounded-xl shadow-xs';

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

// El interruptor es uno para todo el panel (components/ui/interruptor.tsx). Se
// sigue exportando como `Toggle` para no tocar sus usos en cada pestaña.
export { Interruptor as Toggle } from '@/components/ui/interruptor';

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
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', map[tipo])}>
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
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', map[nivel])}>
      {labels[nivel]}
    </span>
  );
}

'use client';

import { useId, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ColorInput, Toggle } from '@/components/configuracion/estilos';

// Las piezas del constructor de widgets. Todas con el mismo lenguaje: la
// etiqueta dice QUÉ es, la línea gris de debajo dice qué pasa al tocarlo, y el
// control va a la derecha o debajo. Sin tooltips para lo importante: se lee
// antes de elegir, no después de equivocarse.

const FOCO = 'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/** Un bloque del panel de ajustes, con su título pequeño en versalitas. */
export function Grupo({ titulo, children, accion }: { titulo: string; children: ReactNode; accion?: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{titulo}</h4>
        {accion}
      </div>
      {children}
    </section>
  );
}

/** Etiqueta + explicación + control debajo. */
export function Ajuste({ etiqueta, descripcion, children, idEtiqueta }: {
  etiqueta: string;
  descripcion?: ReactNode;
  children: ReactNode;
  idEtiqueta?: string;
}) {
  return (
    <div>
      <p id={idEtiqueta} className="text-[13px] font-medium text-foreground">{etiqueta}</p>
      {descripcion && <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{descripcion}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** Un interruptor con su etiqueta a la izquierda. */
export function AjusteInterruptor({ etiqueta, descripcion, on, onChange, disabled }: {
  etiqueta: string;
  descripcion?: string;
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground">{etiqueta}</p>
        {descripcion && <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{descripcion}</p>}
      </div>
      <Toggle on={on} onChange={onChange} ariaLabel={etiqueta} disabled={disabled} className="shrink-0 mt-0.5" />
    </div>
  );
}

/**
 * Control segmentado: una sola opción activa. Botones con `aria-pressed`
 * dentro de un grupo con nombre — el patrón que ya usa el resto del panel.
 */
export function Segmentado<T extends string>({ etiqueta, opciones, valor, onChange, tamano = 'normal' }: {
  etiqueta: string;
  opciones: readonly { valor: T; nombre: string; icono?: ReactNode }[];
  valor: T;
  onChange: (v: T) => void;
  tamano?: 'normal' | 'compacto';
}) {
  return (
    <div role="group" aria-label={etiqueta} className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-border bg-muted/50 p-1">
      {opciones.map(o => {
        const activo = valor === o.valor;
        return (
          <button
            key={o.valor}
            type="button"
            onClick={() => onChange(o.valor)}
            aria-pressed={activo}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors',
              tamano === 'compacto' ? 'px-2.5 py-1 text-[12px]' : 'px-3 py-1.5 text-[12.5px]',
              'min-h-9 [@media(pointer:fine)]:min-h-0',
              activo ? 'bg-card text-foreground shadow-xs ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
              FOCO,
            )}
          >
            {o.icono}
            {o.nombre}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Multi-selección por chips: nada marcado = TODO (el mismo contrato que el
 * código, donde una lista vacía no filtra y ni siquiera se emite).
 */
export function Chips({ etiqueta, descripcion, opciones, seleccion, onChange, vacio }: {
  etiqueta: string;
  descripcion?: string;
  opciones: readonly { id: string; nombre: string }[];
  seleccion: readonly string[];
  onChange: (ids: string[]) => void;
  vacio: string;
}) {
  const idEtiqueta = useId();
  function alternar(id: string) {
    onChange(seleccion.includes(id) ? seleccion.filter(x => x !== id) : [...seleccion, id]);
  }
  return (
    <Ajuste etiqueta={etiqueta} descripcion={descripcion} idEtiqueta={idEtiqueta}>
      {opciones.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">{vacio}</p>
      ) : (
        <div role="group" aria-labelledby={idEtiqueta} className="flex flex-wrap gap-1.5">
          {opciones.map(o => {
            const marcada = seleccion.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => alternar(o.id)}
                aria-pressed={marcada}
                className={cn(
                  'inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-[12px] font-medium transition-colors [@media(pointer:fine)]:min-h-8',
                  marcada ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                  FOCO,
                )}
              >
                {marcada && <Check size={12} className="text-brand" aria-hidden />}
                {o.nombre}
              </button>
            );
          })}
        </div>
      )}
    </Ajuste>
  );
}

/**
 * Un color que se puede dejar SIN tocar (`null`): entonces no viaja en el
 * código y manda el default del widget. `muestra` es lo que se pinta mientras.
 */
export function ColorOpcional({ etiqueta, descripcion, valor, muestra, onChange }: {
  etiqueta: string;
  descripcion?: string;
  valor: string | null;
  muestra: string;
  onChange: (v: string | null) => void;
}) {
  return (
    <Ajuste etiqueta={etiqueta} descripcion={descripcion}>
      <ColorInput value={valor ?? muestra} onChange={onChange} />
      {valor !== null && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn('mt-1.5 text-[11.5px] text-muted-foreground underline underline-offset-2 hover:text-foreground', FOCO)}
        >
          Volver al de por defecto
        </button>
      )}
    </Ajuste>
  );
}

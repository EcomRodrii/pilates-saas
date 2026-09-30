'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Toggle } from '@/components/configuracion/estilos';

// Las piezas del constructor de widgets. Todas con el mismo lenguaje: la
// etiqueta dice QUÉ es, la línea gris de debajo dice qué pasa al tocarlo, y el
// control va a la derecha o debajo. Sin tooltips para lo importante: se lee
// antes de elegir, no después de equivocarse.

export const FOCO = 'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/** 44 px con el dedo (el iPad de recepción), más justo con ratón. */
export const TACTIL = 'inline-flex min-h-11 items-center [@media(pointer:fine)]:min-h-8';

/** «12 sept», en la hora del estudio. */
export function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' });
}

/**
 * Cómo llega un cambio a su web. Se dice en cada bloque porque es LA duda de
 * quien ya lo pegó, y con las MISMAS tres palabras en todo el constructor:
 *  - `vivo`: siempre al día, sin hacer nada (sus clases, precios y plazas);
 *  - `aplicar`: al pulsar «Aplicar en mi web» (el estilo; lo que enseña, con un
 *    código por id), sin volver a pegar nada;
 *  - `codigo`: va en el propio código, y cambiarlo pide pegarlo otra vez.
 */
export type TipoEtiqueta = 'codigo' | 'aplicar' | 'vivo';
export function Etiqueta({ tipo }: { tipo: TipoEtiqueta }) {
  if (tipo === 'codigo') {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-foreground">
        Pegar el código otra vez
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-foreground">
      <Check size={11} aria-hidden />{tipo === 'aplicar' ? 'Con «Aplicar en mi web»' : 'Siempre al día'}
    </span>
  );
}

/** Una tarjeta de un paso, con su título y, si toca, su etiqueta. */
export function Tarjeta({ titulo, etiqueta, subtitulo, children, className }: {
  titulo: string;
  etiqueta?: TipoEtiqueta;
  subtitulo?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn('min-w-0 rounded-2xl border border-border bg-card p-4 shadow-xs @md/config:p-5', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={id} className="text-[15px] font-semibold tracking-tight text-foreground">{titulo}</h3>
        {etiqueta && <Etiqueta tipo={etiqueta} />}
      </div>
      {subtitulo && <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{subtitulo}</p>}
      {children && <div className="mt-4 space-y-5">{children}</div>}
    </section>
  );
}

/**
 * Un pliegue con su flecha. El contenido sigue en el DOM aunque esté cerrado.
 *
 * ⚠️ `abierto` lo ABRE, nunca lo cierra: con `open={abierto}` controlado,
 * React quita el atributo cuando pasa a `false` y el pliegue se cerraba justo
 * después de usar su propio control (apagar «solo las clases de hoy», apagar el
 * diseño propio, autorizar su web). Cerrar es cosa suya.
 */
export function Plegable({ titulo, abierto, children, className, id }: {
  titulo: ReactNode;
  abierto?: boolean;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [inicial] = useState(abierto);
  useEffect(() => {
    if (abierto && ref.current) ref.current.open = true;
  }, [abierto]);
  return (
    <details ref={ref} id={id} open={inicial} className={cn('group', className)}>
      <summary className={cn('flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg text-[13px] font-medium text-foreground [&::-webkit-details-marker]:hidden', FOCO)}>
        <ChevronRight size={15} aria-hidden className="shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        {titulo}
      </summary>
      <div className="pb-1 pt-2">{children}</div>
    </details>
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
  opciones: readonly { valor: T; nombre: string; icono?: ReactNode; desactivada?: boolean }[];
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
            disabled={o.desactivada}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              tamano === 'compacto' ? 'px-2.5 py-1 text-[12px]' : 'px-3 py-1.5 text-[12.5px]',
              'min-h-11 [@media(pointer:fine)]:min-h-9',
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

export interface Opcion<T extends string> {
  valor: T;
  titulo: string;
  detalle?: ReactNode;
  icono?: ReactNode;
  /** Un dibujo encima del título (las formas y cómo se ordena). */
  dibujo?: ReactNode;
  insignia?: string;
  /** Por qué no se puede: se enseña en lugar del detalle. */
  desactivada?: string;
  /** Una línea más, debajo del detalle (p. ej. cuándo se copió). */
  nota?: ReactNode;
}

/**
 * Un `radiogroup` de tarjetas, con el patrón ARIA completo: una sola parada
 * de tabulación y las flechas mueven y eligen. Una opción desactivada se lee
 * (con su motivo) pero no se elige.
 */
export function GrupoOpciones<T extends string>({ etiqueta, opciones, valor, onChange, className, tamano = 'normal' }: {
  etiqueta: string;
  opciones: readonly Opcion<T>[];
  valor: T | null;
  onChange: (v: T) => void;
  className?: string;
  tamano?: 'grande' | 'normal' | 'mini';
}) {
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  const marcada = opciones.findIndex(o => o.valor === valor);
  const primera = opciones.findIndex(o => !o.desactivada);
  const parada = marcada >= 0 ? marcada : primera;

  function teclas(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const paso = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!paso) return;
    e.preventDefault();
    for (let n = 1; n <= opciones.length; n++) {
      const j = (i + paso * n + opciones.length) % opciones.length;
      if (opciones[j].desactivada) continue;
      onChange(opciones[j].valor);
      botones.current[j]?.focus();
      return;
    }
  }

  return (
    <div role="radiogroup" aria-label={etiqueta} className={cn('grid gap-2', opciones.some(o => o.insignia) && 'pt-2.5', className)}>
      {opciones.map((o, i) => {
        const on = i === marcada;
        return (
          <button
            key={o.valor}
            ref={el => { botones.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={o.desactivada ? true : undefined}
            tabIndex={i === parada ? 0 : -1}
            onClick={() => { if (!o.desactivada) onChange(o.valor); }}
            onKeyDown={e => teclas(e, i)}
            className={cn(
              'relative flex min-h-11 min-w-0 rounded-xl border text-left transition-colors',
              tamano === 'mini' ? 'flex-col items-stretch gap-1.5 p-2' : 'items-start gap-3 p-3',
              tamano === 'grande' && 'p-3.5',
              o.dibujo && tamano !== 'mini' && 'flex-col items-stretch',
              on ? 'border-brand/60 bg-brand/5 ring-1 ring-brand/30' : 'border-border bg-card hover:bg-muted/40',
              o.desactivada && 'cursor-not-allowed opacity-60 hover:bg-card',
              FOCO,
            )}
          >
            {o.insignia && (
              <span className="absolute -top-2.5 left-3 rounded-full bg-foreground px-2 py-px text-[10.5px] font-semibold text-background">
                {o.insignia}
              </span>
            )}
            {o.dibujo && <span aria-hidden className="block rounded-lg bg-muted/60 p-1.5 text-muted-foreground">{o.dibujo}</span>}
            {o.icono && (
              <span aria-hidden className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', on ? 'bg-brand text-brand-foreground' : 'bg-muted text-foreground')}>
                {o.icono}
              </span>
            )}
            <span className="min-w-0">
              <span className={cn('block font-semibold text-foreground', tamano === 'mini' ? 'text-[12px]' : 'text-[13px]')}>{o.titulo}</span>
              {(o.desactivada || o.detalle) && (
                <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{o.desactivada ?? o.detalle}</span>
              )}
              {o.nota && <span className="mt-1 block text-[11.5px] leading-snug">{o.nota}</span>}
            </span>
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
                  'inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-[12px] font-medium transition-colors [@media(pointer:fine)]:min-h-8',
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
 * código y manda el de su página de reservas. Se enseña la muestra, nunca el
 * código hexadecimal: ese solo aparece dentro del selector del navegador.
 */
export function MuestraColor({ etiqueta, descripcion, valor, muestra, onChange, porDefecto = 'el de tu página de reservas' }: {
  etiqueta: string;
  descripcion?: string;
  valor: string | null;
  /** El color que se pinta mientras no se toca. */
  muestra: string;
  onChange: (v: string | null) => void;
  /** Con su artículo: «el de tu página de reservas». */
  porDefecto?: string;
}) {
  const id = useId();
  // «a» + «el» se contrae: «Volver al de tu página de reservas».
  const volver = porDefecto.startsWith('el ') ? `Volver al ${porDefecto.slice(3)}` : `Volver a ${porDefecto}`;
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[13px] font-medium text-foreground">{etiqueta}</label>
        {descripcion && <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{descripcion}</p>}
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          {valor === null ? `Ahora: ${porDefecto}.` : 'Ahora: el que elegiste.'}
        </p>
        {valor !== null && (
          <button type="button" onClick={() => onChange(null)} className={cn(TACTIL, 'text-[12px] font-medium text-foreground underline underline-offset-2 hover:no-underline', FOCO)}>
            {volver}
          </button>
        )}
      </div>
      <input
        id={id}
        type="color"
        value={valor ?? muestra}
        onChange={e => onChange(e.target.value)}
        className={cn(
          'size-11 shrink-0 cursor-pointer rounded-full border border-border bg-card p-1',
          '[&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0',
          '[&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0',
          FOCO,
        )}
      />
    </div>
  );
}

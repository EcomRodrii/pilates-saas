'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { acentoDe, estiloPorId, type AparienciaApp, type EstiloId } from '@/lib/student/apariencia';

// Las miniaturas de los ocho estilos de la app de la alumna: su fondo, una
// tarjeta y el botón. Nacieron dentro de «Apariencia de tu app»
// (./editor-apariencia-app.tsx) y viven aquí desde la Fase B del constructor de
// widgets (28-sep-2026), que enseña los MISMOS estilos para la web del estudio:
// dos dibujos del mismo estilo acabarían contando cosas distintas el día que
// cambie uno.

/**
 * El dibujo de un estilo, sin texto que leer (`aria-hidden`: el nombre lo pone
 * quien lo usa). `normal` es el de Apariencia; `mini`, el del constructor de
 * widgets: se estira a lo ancho que haya, para caber cuatro en fila en un móvil.
 */
export function DibujoEstilo({ estilo, acento, boton, tamano = 'normal' }: {
  estilo: EstiloId;
  /** El punto de color de la tarjeta. */
  acento: string;
  boton: { fondo: string; texto: string };
  tamano?: 'normal' | 'mini';
}) {
  const e = estiloPorId(estilo);
  if (tamano === 'mini') {
    return (
      <span aria-hidden className="block px-2 pb-2 pt-2.5 transition-colors duration-300" style={{ background: e.background }}>
        <span
          className="flex items-center gap-1.5 p-1.5"
          style={{ background: e.card, borderRadius: Math.min(e.radios.card, 16) * 0.45, border: `1px solid ${e.border}` }}
        >
          <span className="min-w-0 flex-1 space-y-1">
            <span className="block h-1 w-4/5 rounded-full" style={{ background: e.foreground, opacity: 0.8 }} />
            <span className="block h-1 w-3/5 rounded-full" style={{ background: e.mutedForeground, opacity: 0.45 }} />
          </span>
          <span
            className="block h-2.5 w-4 shrink-0 transition-colors duration-300"
            style={{ background: boton.fondo, borderRadius: e.radios.pill > 100 ? 999 : Math.min(e.radios.pill, 6) * 0.6 }}
          />
        </span>
      </span>
    );
  }
  return (
    <span aria-hidden className="block px-3 pb-3 pt-4 transition-colors duration-300" style={{ background: e.background }}>
      <span className="block p-2.5" style={{ background: e.card, borderRadius: e.radios.card * 0.7, border: `1px solid ${e.border}`, boxShadow: '0 6px 14px -8px rgba(26,26,26,.25)' }}>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full transition-colors duration-300" style={{ background: acento }} />
          <span className="h-1.5 w-12 rounded-full" style={{ background: e.foreground, opacity: 0.8 }} />
        </span>
        <span className="mt-1.5 block h-1.5 w-16 rounded-full" style={{ background: e.mutedForeground, opacity: 0.45 }} />
        <span
          className="mt-2.5 flex h-5 items-center justify-center text-[9px] font-semibold transition-all duration-300"
          style={{ background: boton.fondo, color: boton.texto, borderRadius: Math.min(e.radios.pill, 999) * (e.radios.pill > 100 ? 1 : 0.6) }}
        >
          Reservar
        </span>
      </span>
    </span>
  );
}

/** Miniatura de un estilo en Apariencia: su fondo, una tarjeta y el botón como quedaría con la marca actual. */
export function MuestraEstilo({ app, primary, activo, onElegir }: {
  app: AparienciaApp; primary: string; activo: boolean; onElegir: () => void;
}) {
  const e = estiloPorId(app.estilo);
  const a = acentoDe(primary, app);
  const boton = app.boton === 'marca' ? { fondo: a.accent, texto: a.accentForeground } : { fondo: e.tinta, texto: e.tintaForeground };
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activo}
      onClick={onElegir}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border text-left',
        'transition-[box-shadow,transform,border-color] duration-200 ease-out will-change-transform active:scale-[.98]',
        activo ? 'border-brand shadow-md ring-2 ring-brand/30' : 'border-border hover:-translate-y-0.5 hover:shadow-md',
      )}
    >
      <DibujoEstilo estilo={app.estilo} acento={a.accent} boton={boton} />
      <span className="block border-t border-border bg-card px-3 py-2">
        <span className="flex items-center justify-between gap-2 text-[13px] font-semibold text-foreground">
          {e.nombre}
          {activo && <Check size={14} className="text-brand-medio" aria-hidden />}
        </span>
        <span className="block text-[12px] leading-snug text-muted-foreground">{e.descripcion}</span>
      </span>
    </button>
  );
}

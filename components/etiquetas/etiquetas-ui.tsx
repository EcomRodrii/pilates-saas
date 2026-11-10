'use client';

import { Check } from 'lucide-react';
import { COLORES_ETIQUETA, NOMBRE_DE_COLOR, estiloDeEtiqueta, type ColorEtiqueta } from '@/lib/etiquetas/etiquetas';
import { cn } from '@/lib/utils';

// Las dos piezas de una etiqueta que comparten Configuración (donde se crean y se cambian) y la ficha de la alumna (donde se
// ponen): su chip de color y el selector de los ocho colores.

export function Colores({ valor, onElegir, etiqueta }: { valor: ColorEtiqueta; onElegir: (c: ColorEtiqueta) => void; etiqueta: string }) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="flex flex-wrap gap-1.5 tactil:gap-3">
      {COLORES_ETIQUETA.map(c => {
        const estilo = estiloDeEtiqueta(c);
        const activo = c === valor;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={activo}
            aria-label={NOMBRE_DE_COLOR[c]}
            title={NOMBRE_DE_COLOR[c]}
            onClick={() => onElegir(c)}
            className={cn(
              'zona-tactil flex size-7 items-center justify-center rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              activo ? 'ring-2 ring-foreground ring-offset-2 ring-offset-card' : '',
            )}
            style={{ backgroundColor: estilo.color, borderColor: estilo.borderColor }}
          >
            {activo && <Check size={14} className="text-card" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({ nombre, color }: { nombre: string; color: ColorEtiqueta }) {
  return (
    <span className="inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[12.5px] font-semibold" style={estiloDeEtiqueta(color)}>
      <span className="truncate">{nombre}</span>
    </span>
  );
}

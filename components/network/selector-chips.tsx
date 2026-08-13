'use client';

import { cn } from '@/lib/utils';

// Selector múltiple en chips — reutilizado por especialidades, horarios y
// tipo de trabajo en /network/mi-perfil. Sin dependencia de ningún catálogo
// concreto: recibe las opciones ya resueltas a { valor, etiqueta }.
export function SelectorChips<T extends string>({
  opciones, seleccion, onChange,
}: {
  opciones: { valor: T; etiqueta: string }[];
  seleccion: T[];
  onChange: (siguiente: T[]) => void;
}) {
  function alternar(valor: T) {
    onChange(seleccion.includes(valor) ? seleccion.filter(v => v !== valor) : [...seleccion, valor]);
  }
  return (
    <div className="flex flex-wrap gap-2">
      {opciones.map(({ valor, etiqueta }) => {
        const activo = seleccion.includes(valor);
        return (
          <button
            key={valor}
            type="button"
            onClick={() => alternar(valor)}
            aria-pressed={activo}
            className={cn(
              'px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors',
              activo
                ? 'bg-brand text-brand-foreground border-brand'
                : 'bg-card text-foreground border-border hover:bg-muted',
            )}
          >
            {etiqueta}
          </button>
        );
      })}
    </div>
  );
}

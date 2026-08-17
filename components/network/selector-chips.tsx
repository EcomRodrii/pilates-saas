'use client';

import { cn } from '@/lib/utils';

// Selector en chips — reutilizado por especialidades, horarios y tipo de
// trabajo en /network/mi-perfil (multiselección real, `aria-pressed`
// correcto ahí). Sin dependencia de ningún catálogo concreto: recibe las
// opciones ya resueltas a { valor, etiqueta }.
//
// `unico`: dos sitios del wizard (Disponibilidad → Estado, Tarifa) lo usaban
// con un array de un solo elemento y un `onChange` que simulaba un radio
// button por fuera (`sel[sel.length-1] ?? valorAnterior`) — funcionaba, pero
// un lector de pantalla anunciaba cada chip como "botón, presionado/no
// presionado" en vez de "opción X de un grupo, seleccionada": semántica de
// checkbox para una decisión mutuamente excluyente (hallazgo de la
// auditoría UX). Con `unico`, el propio componente decide radiogroup/radio
// y reemplaza la selección en vez de alternarla.
export function SelectorChips<T extends string>({
  opciones, seleccion, onChange, unico = false,
}: {
  opciones: { valor: T; etiqueta: string }[];
  seleccion: T[];
  onChange: (siguiente: T[]) => void;
  unico?: boolean;
}) {
  function elegir(valor: T) {
    if (unico) { onChange([valor]); return; }
    onChange(seleccion.includes(valor) ? seleccion.filter(v => v !== valor) : [...seleccion, valor]);
  }
  return (
    <div className="flex flex-wrap gap-2" role={unico ? 'radiogroup' : undefined}>
      {opciones.map(({ valor, etiqueta }) => {
        const activo = seleccion.includes(valor);
        return (
          <button
            key={valor}
            type="button"
            role={unico ? 'radio' : undefined}
            onClick={() => elegir(valor)}
            aria-pressed={unico ? undefined : activo}
            aria-checked={unico ? activo : undefined}
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

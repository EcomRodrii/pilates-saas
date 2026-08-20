'use client';

import { cn } from '@/lib/utils';
import { NW_PRODUCTO, NW_TINTA, NW_BORDE, NW_BORDE_HOVER } from '@/components/network-v2/tokens';

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
//
// `v2`: se usaba dentro de /network/crear-perfil (paleta hex de
// components/network-v2/tokens.ts) con las clases de Studio (bg-brand,
// border-border) tal cual — "cuadraba" solo porque hoy --brand/--foreground/
// --border de Studio coinciden por casualidad con NW_PRODUCTO/NW_TINTA/
// NW_BORDE (auditoría del sistema de diseño, 2026-08-18). Con `v2` deja de
// depender de esa coincidencia — mismo patrón de bifurcación className/style
// que ya usa seccion-experiencia.tsx (tokensNetworkV2).
export function SelectorChips<T extends string>({
  opciones, seleccion, onChange, unico = false, v2 = false,
}: {
  opciones: { valor: T; etiqueta: string }[];
  seleccion: T[];
  onChange: (siguiente: T[]) => void;
  unico?: boolean;
  v2?: boolean;
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
            className={v2
              ? 'px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors'
              : cn(
                'px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors',
                activo
                  ? 'bg-brand text-brand-foreground border-brand'
                  : 'bg-card text-foreground border-border hover:bg-muted',
              )}
            style={v2 ? (
              activo
                ? { background: NW_PRODUCTO, color: '#fff', borderColor: NW_PRODUCTO }
                : { background: '#fff', color: NW_TINTA, borderColor: NW_BORDE }
            ) : undefined}
            onMouseEnter={v2 && !activo ? e => { e.currentTarget.style.borderColor = NW_BORDE_HOVER; } : undefined}
            onMouseLeave={v2 && !activo ? e => { e.currentTarget.style.borderColor = NW_BORDE; } : undefined}
          >
            {etiqueta}
          </button>
        );
      })}
    </div>
  );
}

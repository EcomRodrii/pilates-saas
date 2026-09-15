'use client';

import { useId, type ReactNode } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cardCls } from '@/components/configuracion/estilos';
import { tarjetaPorId, type TarjetaId } from '@/lib/configuracion/secciones';
import { FILA, IconoFila } from './fila-herramienta';

// Una sección de Configuración como grupos de filas, no como formularios
// apilados (§4.2). Cada fila dice qué es y cómo está HOY —«L-V 8:00–22:00 · D
// cerrado»— y al tocarla abre su cajón (cajon-ajuste.tsx). El título y la
// descripción salen de lib/configuracion/secciones.ts por el `id`, que es
// también el ancla de sus enlaces (`#horario`).

/** Un grupo con su título, en frase normal. */
export function GrupoFilas({ titulo, children }: { titulo: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="max-w-2xl space-y-2">
      <h3 id={id} className="px-1 text-sm font-semibold text-foreground">{titulo}</h3>
      <ul data-tarjeta-ajuste="" className={cn(cardCls, 'divide-y divide-border overflow-hidden')}>
        {children}
      </ul>
    </section>
  );
}

/** `valor`: cómo está (lib/configuracion/resumenes.ts); `null` = no se sabe, y va su descripción. */
export function FilaAjuste({
  id,
  icono,
  valor,
  onAbrir,
}: {
  id: TarjetaId;
  icono: LucideIcon;
  valor: string | null;
  onAbrir: (id: TarjetaId) => void;
}) {
  const tarjeta = tarjetaPorId(id);
  return (
    <li>
      <button
        id={id}
        type="button"
        aria-haspopup="dialog"
        onClick={() => onAbrir(id)}
        className={cn(FILA, 'w-full scroll-mt-32 scroll-mb-32 text-left')}
      >
        <IconoFila icono={icono} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-foreground">{tarjeta.titulo}</span>
          {/* El valor, en UNA línea (§4.2): lo que no cabe a 375 px se corta con
              «…» y está entero en el cajón. La descripción, si no se sabe el
              valor, puede ocupar dos. */}
          <span
            data-resumen={valor ? 'valor' : 'descripcion'}
            className={cn('block text-sm text-muted-foreground', valor ? 'truncate' : 'line-clamp-2 text-pretty')}
          >
            {valor ?? tarjeta.frase}
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden />
      </button>
    </li>
  );
}

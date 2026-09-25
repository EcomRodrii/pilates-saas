'use client';

import { useMemo, useState } from 'react';
import {
  BadgeEuro, Building2, CalendarCheck, CalendarDays, Clapperboard, Clock, Gift, Mail, Newspaper,
  PartyPopper, ShoppingBag, Sparkles, Star, Ticket, UserRound, Users, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATEGORIAS, widgetsVisibles, type CategoriaWidget, type Widget } from '@/lib/widgets/catalogo';

// La biblioteca: QUÉ widget. El cómo (iframe, popup, enlace…) va aparte, en
// «Cómo integrarlo» — son dos preguntas distintas y antes estaban mezcladas.

export const ICONOS: Record<string, LucideIcon> = {
  CalendarDays, Clock, UserRound, CalendarCheck, BadgeEuro, Ticket, Gift, ShoppingBag,
  Sparkles, Mail, Newspaper, Building2, Users, Star, PartyPopper, Clapperboard,
};

const FOCO = 'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

export function Biblioteca({ activo, onElegir }: { activo: string; onElegir: (id: string) => void }) {
  const [categoria, setCategoria] = useState<CategoriaWidget | 'todos'>('todos');
  const visibles = useMemo(() => widgetsVisibles(), []);
  const lista = categoria === 'todos' ? visibles : visibles.filter(w => w.categoria === categoria);
  // Primero lo que funciona: los que están en preparación, al final de cada
  // categoría y sin poder elegirse.
  const ordenada = [...lista].sort((a, b) => Number(a.estado !== 'disponible') - Number(b.estado !== 'disponible'));

  return (
    <nav aria-label="Biblioteca de widgets" className="min-w-0">
      <div role="group" aria-label="Categoría" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] @2xl/config:flex-wrap">
        {([{ id: 'todos', nombre: 'Todos' }, ...CATEGORIAS] as const).map(c => {
          const on = categoria === c.id;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => setCategoria(c.id)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors min-h-9 [@media(pointer:fine)]:min-h-0',
                on ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                FOCO,
              )}
            >
              {c.nombre}
            </button>
          );
        })}
      </div>

      {/* Con sitio, una rejilla donde se ve todo de un vistazo; en el móvil,
          una tira horizontal para no empujar la vista previa fuera de la
          pantalla. Arriba y no en una columna lateral: la vista previa necesita
          el ancho para que el escritorio se lea. */}
      <ul className="mt-3 flex snap-x gap-2 overflow-x-auto pb-2 @2xl/config:grid @2xl/config:grid-cols-[repeat(auto-fill,minmax(210px,1fr))] @2xl/config:overflow-visible @2xl/config:pb-0">
        {ordenada.map(w => (
          <li key={w.id} className="w-[230px] shrink-0 snap-start @2xl/config:w-auto">
            <Tarjeta widget={w} activo={activo === w.id} onElegir={onElegir} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Tarjeta({ widget: w, activo, onElegir }: { widget: Widget; activo: boolean; onElegir: (id: string) => void }) {
  const Icono = ICONOS[w.icono] ?? CalendarDays;
  const disponible = w.estado === 'disponible';
  const cuerpo = (
    <>
      <span
        aria-hidden
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors',
          activo ? 'bg-brand text-brand-foreground' : disponible ? 'bg-muted text-foreground' : 'bg-muted/60 text-muted-foreground',
        )}
      >
        <Icono size={16} strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn('truncate text-[13px] font-semibold', disponible ? 'text-foreground' : 'text-muted-foreground')}>{w.nombre}</span>
          {!disponible && (
            <span className="shrink-0 rounded-full border border-border px-1.5 py-px text-[10px] font-medium text-muted-foreground">Próximamente</span>
          )}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-snug text-muted-foreground">
          {disponible ? w.descripcion : w.falta}
        </span>
      </span>
    </>
  );

  if (!disponible) {
    // No es un botón: no hace nada, y un botón que no hace nada es justo lo
    // que no se pinta. Se lee, no se pulsa.
    return (
      <div className="flex h-full items-start gap-3 rounded-xl border border-dashed border-border px-3 py-2.5 opacity-80">
        {cuerpo}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onElegir(w.id)}
      aria-pressed={activo}
      className={cn(
        'flex h-full w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
        activo ? 'border-brand/60 bg-brand/5 shadow-xs' : 'border-border bg-card hover:border-foreground/20 hover:bg-muted/40',
        FOCO,
      )}
    >
      {cuerpo}
    </button>
  );
}

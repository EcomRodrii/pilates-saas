'use client';

import Link from 'next/link';
import {
  Building2, Calendar, CalendarCheck, ChevronRight, CircleUser, CreditCard, Download, Globe, Mail, Plug,
  Trophy, UserCog, UserPlus, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { cardCls } from '@/components/configuracion/estilos';
import { hrefDeSeccion } from '@/lib/configuracion/destino';
import { MI_CUENTA, type SeccionConfiguracion, type SeccionId } from '@/lib/configuracion/secciones';
import { esClicNormal } from './contexto';

// La lista de secciones, en sus dos formas:
//   · `lista` — la pantalla de entrada del móvil: una fila por pregunta, con su
//     resumen, a un toque de cada sección;
//   · `rail` — la columna de la izquierda a partir de 768 px, la misma lista
//     sin resumen. Mismo componente para que girar el iPad no cambie de sitio
//     nada.
//
// Son enlaces de verdad (se pueden abrir en otra pestaña o compartir), no
// pestañas: por eso `aria-current` y no `tablist`.

// El mismo icono que el menú lateral cuando es el mismo concepto (Clases,
// Cobros, Equipo), y sin colores de categoría: el color aquí no distingue nada.
const ICONOS: Record<SeccionId, LucideIcon> = {
  estudio: Building2,
  clases: Calendar,
  reservas: CalendarCheck,
  cobros: CreditCard,
  altas: UserPlus,
  comunicacion: Mail,
  equipo: UserCog,
  web: Globe,
  motivacion: Trophy,
  conexiones: Plug,
  datos: Download,
};

const foco = 'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

export function ListaSecciones({
  variant,
  secciones,
  activa,
  onElegir,
}: {
  variant: 'lista' | 'rail';
  secciones: readonly SeccionConfiguracion[];
  activa: SeccionId | null;
  /** `fila` es el id del enlace pulsado, para devolverle el foco al volver. */
  onElegir: (id: SeccionId, fila: string) => void;
}) {
  const rail = variant === 'rail';

  return (
    <nav aria-label="Secciones de Configuración" className={rail ? 'space-y-2' : 'space-y-3'}>
      <ul className={rail ? 'space-y-0.5' : cn(cardCls, 'divide-y divide-border overflow-hidden')}>
        {secciones.map(s => {
          const Icono = ICONOS[s.id];
          const fila = `${variant}-seccion-${s.id}`;
          const actual = rail && activa === s.id;
          return (
            <li key={s.id}>
              <Link
                id={fila}
                href={hrefDeSeccion(s.id)}
                aria-current={actual ? 'page' : undefined}
                onClick={e => {
                  if (!esClicNormal(e)) return;
                  e.preventDefault();
                  onElegir(s.id, fila);
                }}
                className={rail
                  ? cn(
                    'relative flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted',
                    foco,
                    actual && 'bg-muted font-semibold before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-brand',
                  )
                  : cn('flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted focus-visible:ring-inset', foco)}
              >
                {rail ? (
                  <Icono size={16} className="shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                    <Icono size={20} aria-hidden />
                  </span>
                )}
                {rail ? (
                  <span className="min-w-0 flex-1">{s.titulo}</span>
                ) : (
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-foreground">{s.titulo}</span>
                    <span className="line-clamp-2 block text-sm text-muted-foreground">{s.resumen}</span>
                  </span>
                )}
                {!rail && <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden />}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* «Mi cuenta» no es configuración del estudio: es de quien entra, y tiene
          su propia pantalla. Va aparte para que no se lea como una sección más. */}
      <div className={rail ? 'border-t border-border pt-2' : cardCls}>
        <Link
          href={MI_CUENTA.href}
          className={rail
            ? cn('flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted', foco)
            : cn('flex min-h-16 items-center gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-muted', foco)}
        >
          {rail ? (
            <CircleUser size={16} className="shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
              <CircleUser size={20} aria-hidden />
            </span>
          )}
          {rail ? (
            <span className="min-w-0 flex-1">{MI_CUENTA.titulo}</span>
          ) : (
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-foreground">{MI_CUENTA.titulo}</span>
              <span className="block text-sm text-muted-foreground">{MI_CUENTA.resumen}</span>
            </span>
          )}
          {!rail && <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden />}
        </Link>
      </div>
    </nav>
  );
}

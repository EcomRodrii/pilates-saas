'use client';

import Link from 'next/link';
import { CalendarRange, ChevronRight, Code2, DoorOpen, Gift, Mail, Newspaper, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cardCls } from '@/components/configuracion/estilos';
import { hrefDeHerramienta } from '@/lib/configuracion/destino';
import { herramientaPorId, type HerramientaId } from '@/lib/configuracion/secciones';
import type { ResumenFila } from '@/lib/configuracion/resumenes';
import { esClicNormal, useNavegacionConfig } from './contexto';
import { EstadoAjuste } from './estado-ajuste';

// La fila de una herramienta grande dentro de su sección: su nombre, cómo está
// y a un toque su pantalla (`?tab=…&abrir=…`).
//
// Antes cada una se pintaba entera en la sección —el constructor de widgets, la
// lista de correos, el catálogo de clases— y un interruptor de una línea
// quedaba encajado entre dos herramientas de mil líneas. Ahora la sección cuenta
// cómo está cada cosa y la herramienta se abre aparte, a todo el ancho.
//
// Es un enlace de verdad (se abre en otra pestaña, se comparte), pero dentro del
// panel va por el shell y `pushState`: con el router, en producción la dirección
// se quedaba en la sección de llegada (#2030). Al volver, el shell le devuelve
// el foco a esta fila (`idFilaHerramienta`).

export const ICONOS_HERRAMIENTA: Record<HerramientaId, LucideIcon> = {
  salas: DoorOpen,
  'tipos-de-clase': CalendarRange,
  'correos-automaticos': Mail,
  'recompensas-y-logros': Gift,
  'contenido-de-tu-app': Newspaper,
  widgets: Code2,
};

export const idFilaHerramienta = (id: HerramientaId) => `fila-herramienta-${id}`;

/** Una fila de Configuración: la de una herramienta y la que abre un cajón (fila-ajuste.tsx). */
export const FILA = 'flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50';

export function IconoFila({ icono: Icono }: { icono: LucideIcon }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
      <Icono size={20} aria-hidden />
    </span>
  );
}

/**
 * `valor`: cómo está (lib/configuracion/resumenes.ts); `null` = no se sabe, y va su descripción.
 * `estado`: su ÚNICA pastilla, si la lleva (el plan, en Motivación).
 */
export function FilaHerramienta({ id, valor, estado }: { id: HerramientaId; valor: string | null; estado?: ResumenFila['estado'] }) {
  const nav = useNavegacionConfig();
  const h = herramientaPorId(id);
  return (
    <li>
      <Link
        id={idFilaHerramienta(id)}
        href={hrefDeHerramienta(id)}
        onClick={e => {
          if (!nav || !esClicNormal(e)) return;
          e.preventDefault();
          nav.irA(h.seccion, { abrir: id, modo: 'push' });
        }}
        className={cn(FILA, 'scroll-mt-32 scroll-mb-32')}
      >
        <IconoFila icono={ICONOS_HERRAMIENTA[id]} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[15px] font-semibold text-foreground">{h.titulo}</span>
            {estado && <EstadoAjuste tono={estado.tono}>{estado.etiqueta}</EstadoAjuste>}
          </span>
          <span data-resumen={valor ? 'valor' : 'descripcion'} className="block text-sm text-muted-foreground text-pretty">
            {valor ?? h.resumen}
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

export function FilasHerramienta({ filas }: { filas: readonly { id: HerramientaId; valor: string | null }[] }) {
  return (
    <ul className={cn(cardCls, 'max-w-2xl divide-y divide-border overflow-hidden')} data-tarjeta-ajuste="">
      {filas.map(f => <FilaHerramienta key={f.id} {...f} />)}
    </ul>
  );
}

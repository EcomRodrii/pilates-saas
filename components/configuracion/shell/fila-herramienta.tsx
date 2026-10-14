'use client';

import { usePanelNuevo } from '@/lib/estudio/panel-nuevo-cliente';
import Link from 'next/link';
import { ArrowUpRight, BellRing, CalendarRange, ChevronRight, Code2, DoorOpen, Gift, Mail, Newspaper, Smartphone, Ticket, type LucideIcon } from 'lucide-react';
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
  'tus-avisos': BellRing,
  'avisos-del-movil': Smartphone,
  'codigos-descuento': Ticket,
};

/** Panel nuevo: cada fila de un grupo, su propia tarjeta (Bonsai b-75). */
export const FILAS_COMO_TARJETAS = '[&>li]:overflow-hidden [&>li]:rounded-[14px] [&>li]:border [&>li]:border-border [&>li]:bg-card [&>li]:shadow-[0_1px_2px_rgba(0,0,0,0.03)]';

export const idFilaHerramienta = (id: HerramientaId) => `fila-herramienta-${id}`;

/** Una fila de Configuración: la de una herramienta y la que abre un cajón (fila-ajuste.tsx). */
export const FILA = 'flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50';

/**
 * Panel nuevo (14-oct-2026), copiado de Preferencias de Bonsai (b-75/b-76): cada
 * ajuste es su propia tarjeta, sin icono, con el título, su explicación y, a la
 * derecha, su control: el interruptor si es un sí/no, y si no, una caja con el
 * valor de hoy que abre su editor de siempre (que se guarda con «Guardar»).
 */
export const FILA_NUEVA = 'flex w-full flex-col gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 sm:flex-row sm:items-center sm:gap-5';

/** La caja de la derecha: el valor de hoy, como el campo de Bonsai, y la flecha de que se abre. */
export function CajaValor({ valor, externo = false }: { valor: string | null; externo?: boolean }) {
  return (
    <span className="flex min-h-10 w-full shrink-0 items-center justify-between gap-2 rounded-[10px] border border-border bg-background/60 px-3 py-2 text-[13.5px] font-medium text-foreground sm:w-auto sm:max-w-[46%]">
      <span className="truncate">{valor ?? 'Configurar'}</span>
      {externo
        ? <ArrowUpRight size={15} className="shrink-0 text-muted-foreground" aria-hidden />
        : <ChevronRight size={15} className="shrink-0 text-muted-foreground" aria-hidden />}
    </span>
  );
}

export function IconoFila({ icono: Icono }: { icono: LucideIcon }) {
  // Panel nuevo: sin icono, como las filas de Preferencias de Bonsai.
  const panelNuevo = usePanelNuevo();
  if (panelNuevo) return null;
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
  const panelNuevo = usePanelNuevo();
  if (panelNuevo) {
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
          className={cn(FILA_NUEVA, 'scroll-mt-32 scroll-mb-32')}
        >
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[15px] font-semibold text-foreground">{h.titulo}</span>
              {estado && <EstadoAjuste tono={estado.tono}>{estado.etiqueta}</EstadoAjuste>}
            </span>
            <span data-resumen={valor ? 'valor' : 'descripcion'} className="mt-0.5 block text-[13px] text-muted-foreground text-pretty">{h.resumen}</span>
          </span>
          <CajaValor valor={valor} />
        </Link>
      </li>
    );
  }
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
  const panelNuevo = usePanelNuevo();
  return (
    <ul className={panelNuevo ? cn('max-w-3xl space-y-2.5', FILAS_COMO_TARJETAS) : cn(cardCls, 'max-w-2xl divide-y divide-border overflow-hidden')} data-tarjeta-ajuste="">
      {filas.map(f => <FilaHerramienta key={f.id} {...f} />)}
    </ul>
  );
}

'use client';

import { usePanelNuevo, useShellNuevo } from '@/lib/estudio/panel-nuevo-cliente';
import { Flechita } from './flechita';
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
  canjes: Gift,
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
export const FILA_NUEVA = 'flex w-full flex-col gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 sm:flex-row sm:items-center sm:gap-5 group-data-[sangre]/config:sm:gap-3 group-data-[sangre]/config:px-4 group-data-[sangre]/config:pt-3 group-data-[sangre]/config:pb-4';

/** La tarjeta de lista de Shopify: 784 px, radio 16 y un aro de 1 px con sombra apilada (la misma de las tarjetas de Inicio, `globals.css`). */
export const TARJETA_SANGRE = "max-w-[784px] overflow-hidden rounded-[16px] [&>li]:relative [&>li+li]:before:absolute [&>li+li]:before:left-12 [&>li+li]:before:right-4 [&>li+li]:before:top-0 [&>li+li]:before:h-px [&>li+li]:before:bg-border [&>li+li]:before:content-[''] bg-card shadow-[0_5px_5px_-2.5px_#00000008,0_3px_3px_-1.5px_#00000005,0_2px_2px_-1px_#00000005,0_1px_1px_-0.5px_#00000008,0_0.5px_0.5px_0_#0000000a,0_0_0_1px_#0000000f]";

/** La caja de la derecha: el valor de hoy, como el campo de Bonsai, y la flecha de que se abre. */
export function CajaValor({ valor, externo = false }: { valor: string | null; externo?: boolean }) {
  const shellNuevo = useShellNuevo();
  // Como Shopify: el valor va en gris, sin caja, y la flecha al final.
  if (shellNuevo) {
    return (
      <span className="flex w-full shrink-0 items-center justify-between gap-2 text-[13px] text-muted-foreground sm:w-auto sm:max-w-[46%]">
        <span className="truncate">{valor ?? 'Configurar'}</span>
        {externo
          ? <ArrowUpRight size={16} className="shrink-0" aria-hidden />
          : <ChevronRight size={16} className="shrink-0" aria-hidden />}
      </span>
    );
  }
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
  const sangre = useShellNuevo();
  // Como Shopify: el icono de contorno, a secas (20 px), a la izquierda del título.
  if (sangre) return <span className="flex size-5 shrink-0 items-center justify-center self-start text-[#303030] sm:self-center"><Icono size={20} aria-hidden /></span>;
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
  const sangre = useShellNuevo();
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
          {sangre && <IconoFila icono={ICONOS_HERRAMIENTA[id]} />}
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={sangre ? 'text-[13px] font-normal leading-5 tracking-[-0.13px] text-[#101010]' : 'text-[15px] font-semibold text-foreground'}>{h.titulo}</span>
              {estado && <EstadoAjuste tono={estado.tono}>{estado.etiqueta}</EstadoAjuste>}
            </span>
            <span data-resumen={valor ? 'valor' : 'descripcion'} className="mt-0.5 block text-[13px] text-muted-foreground text-pretty group-data-[sangre]/config:mt-0 group-data-[sangre]/config:leading-5 group-data-[sangre]/config:text-[#4a4a4a]">{sangre ? (valor ?? h.resumen) : h.resumen}</span>
          </span>
          {sangre ? <Flechita /> : <CajaValor valor={valor} />}
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
            <span className={sangre ? 'text-[13px] font-normal leading-5 tracking-[-0.13px] text-[#101010]' : 'text-[15px] font-semibold text-foreground'}>{h.titulo}</span>
            {estado && <EstadoAjuste tono={estado.tono}>{estado.etiqueta}</EstadoAjuste>}
          </span>
          <span data-resumen={valor ? 'valor' : 'descripcion'} className="block text-sm text-muted-foreground text-pretty">
            {valor ?? h.resumen}
          </span>
        </span>
        <Flechita />
      </Link>
    </li>
  );
}

export function FilasHerramienta({ filas }: { filas: readonly { id: HerramientaId; valor: string | null }[] }) {
  const sangre = useShellNuevo();
  const panelNuevo = usePanelNuevo();
  return (
    <ul className={sangre ? TARJETA_SANGRE : panelNuevo ? cn('max-w-3xl space-y-2.5', FILAS_COMO_TARJETAS) : cn(cardCls, 'max-w-2xl divide-y divide-border overflow-hidden')} data-tarjeta-ajuste="">
      {filas.map(f => <FilaHerramienta key={f.id} {...f} />)}
    </ul>
  );
}

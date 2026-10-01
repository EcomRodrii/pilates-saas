'use client';

import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal, RefreshCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardDrawer } from '@/components/ui/dashboard-drawer';
import { MenuAcciones, type AccionMenu } from '@/components/ui/menu-acciones';

// La ficha de una clase (decisión 5 del rediseño, 1-oct-2026): al lado de la
// rejilla y sin taparla en un ordenador, en un cajón en el iPad en vertical y
// en una hoja desde abajo en el móvil. El mismo contenido en los tres.
//
// Arriba, lo que es la clase y en qué punto está; debajo, lo principal del
// momento (sin cubrir, una incidencia, una plaza que ofrecer…), y las pestañas.
// Todo lo demás que se le puede hacer a la clase, en su ⋯, con lo que hace de
// verdad escrito debajo de cada opción.

export type ModoFicha = 'lateral' | 'cajon' | 'hoja';
export type PestanaFicha = 'clientas' | 'plazas' | 'historial';

export interface PastillaFicha {
  texto: string;
  tono: 'exito' | 'aviso' | 'peligro' | 'neutro';
  /** Punto verde de «en curso». */
  punto?: boolean;
}

const TONO_PASTILLA: Record<PastillaFicha['tono'], string> = {
  exito: 'bg-[color-mix(in_srgb,var(--success)_13%,var(--card))] text-[color-mix(in_srgb,var(--success)_80%,var(--foreground))]',
  aviso: 'bg-[color-mix(in_srgb,var(--warning)_14%,var(--card))] text-foreground',
  peligro: 'bg-destructive/10 text-destructive',
  neutro: 'bg-muted text-foreground',
};

export interface FichaClaseProps {
  modo: ModoFicha;
  abierta: boolean;
  onCerrar: () => void;
  /** Alguien toca la ficha (al lado): el modo mostrador deja de cambiarla sola. */
  onTocar?: () => void;
  titulo: string;
  color: string;
  /** «Jueves 1 oct · 10:30 – 11:20». */
  cuando: string;
  /** «Sala Reformer · Marta Ruiz». */
  donde: string;
  repeticion: string | null;
  pastilla: PastillaFicha | null;
  /** A la derecha de la pastilla: «4 de 6 han venido». */
  cifra?: ReactNode;
  /** Una frase más cuando hace falta: por qué está sin cubrir, la incidencia… */
  explicacion?: ReactNode;
  onAnterior?: () => void;
  onSiguiente?: () => void;
  menu: AccionMenu[];
  pieMenu?: string;
  /** Lo principal del momento, encima de las pestañas. */
  principal?: ReactNode;
  pestana: PestanaFicha;
  onPestana: (p: PestanaFicha) => void;
  nClientas: number;
  /** La sala tiene mapa de sitios: hay pestaña de Plazas. */
  conPlazas: boolean;
  clientas: ReactNode;
  plazas?: ReactNode;
  sustituciones: ReactNode;
}

const BOTON_CABEZA = 'flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30';

function Contenido(p: FichaClaseProps) {
  const pestanas: { id: PestanaFicha; texto: string }[] = [
    { id: 'clientas', texto: 'Clientas' },
    ...(p.conPlazas ? [{ id: 'plazas' as const, texto: 'Plazas' }] : []),
    { id: 'historial', texto: 'Sustituciones' },
  ];
  const activa: PestanaFicha = !p.conPlazas && p.pestana === 'plazas' ? 'clientas' : p.pestana;

  return (
    <>
      {p.modo === 'hoja' && <span className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-foreground/20" aria-hidden />}
      <div className="shrink-0 border-b border-border px-5 pt-4 pb-3.5" data-testid="ficha-clase-cabeza">
        <div className="flex items-center gap-2">
          <span className="size-3 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
          {/* tabIndex -1: recibe el foco al abrir la ficha al lado (no es un control). */}
          <h2 tabIndex={-1} className="min-w-0 truncate text-[19px] font-semibold text-foreground outline-none">{p.titulo}</h2>
          <span className="ml-auto flex shrink-0 items-center gap-0.5">
            <button type="button" className={BOTON_CABEZA} onClick={p.onAnterior} disabled={!p.onAnterior} aria-label="Clase anterior" title="Clase anterior">
              <ChevronLeft size={18} />
            </button>
            <button type="button" className={BOTON_CABEZA} onClick={p.onSiguiente} disabled={!p.onSiguiente} aria-label="Clase siguiente" title="Clase siguiente">
              <ChevronRight size={18} />
            </button>
            {p.menu.length > 0 && (
              <MenuAcciones
                acciones={p.menu}
                pie={p.pieMenu}
                ancho="ancho"
                etiqueta="Más acciones de la clase"
                boton={<MoreHorizontal size={18} />}
                claseBoton={BOTON_CABEZA}
              />
            )}
            <button type="button" className={BOTON_CABEZA} onClick={p.onCerrar} aria-label="Cerrar la ficha" title="Cerrar">
              <X size={18} />
            </button>
          </span>
        </div>
        <p className="mt-1 text-[14px] font-medium text-foreground">{p.cuando}</p>
        <p className="text-[13px] text-muted-foreground">{p.donde}</p>
        {p.repeticion && (
          <p className="mt-0.5 flex items-center gap-1 text-[12.5px] text-muted-foreground" data-testid="repeticion-clase">
            <RefreshCw size={12} aria-hidden className="shrink-0" />
            <span className="truncate">{p.repeticion}</span>
          </p>
        )}
        {(p.pastilla || p.cifra) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {p.pastilla && (
              <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold', TONO_PASTILLA[p.pastilla.tono])} data-testid="estado-clase">
                {p.pastilla.punto && <span className="size-1.5 rounded-full bg-[var(--success)]" aria-hidden />}
                {p.pastilla.texto}
              </span>
            )}
            {p.cifra && <span className="ml-auto text-[13px] tabular-nums text-muted-foreground">{p.cifra}</span>}
          </div>
        )}
        {p.explicacion && <div className="mt-2 text-[13.5px] text-foreground text-pretty">{p.explicacion}</div>}
      </div>

      {p.principal && <div className="shrink-0 space-y-3 border-b border-border px-5 py-4">{p.principal}</div>}

      <div role="tablist" aria-label="Qué ver de la clase" className="flex shrink-0 gap-1 border-b border-border px-3">
        {pestanas.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activa === t.id}
            onClick={() => p.onPestana(t.id)}
            className={cn(
              'relative px-2.5 py-2.5 text-[13.5px] font-medium transition-colors',
              activa === t.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.texto}
            {t.id === 'clientas' && <span className="ml-1 tabular-nums text-muted-foreground">{p.nClientas}</span>}
            {activa === t.id && <span className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-full bg-foreground" aria-hidden />}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" role="tabpanel">
        {activa === 'clientas' && p.clientas}
        {activa === 'plazas' && <div className="px-4 py-4">{p.plazas}</div>}
        {activa === 'historial' && <div className="px-4 py-4">{p.sustituciones}</div>}
      </div>
    </>
  );
}

export function FichaClase(p: FichaClaseProps) {
  if (p.modo === 'lateral') {
    if (!p.abierta) return null;
    return (
      <aside
        aria-label={`Clase: ${p.titulo}`}
        data-testid="ficha-clase"
        data-ficha-al-lado=""
        // Al lado no es un diálogo (no atrapa el foco), pero Esc la cierra igual
        // si el foco está dentro: es lo que espera quien va con el teclado. Y
        // solo a ella: `preventDefault` es lo que mira la vista ampliada para no
        // cerrarse también con la misma tecla.
        onKeyDown={e => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); p.onCerrar(); } }}
        onPointerDownCapture={p.onTocar}
        onKeyDownCapture={p.onTocar}
        className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
      >
        <Contenido {...p} />
      </aside>
    );
  }
  return (
    <DashboardDrawer
      open={p.abierta}
      onClose={p.onCerrar}
      label={`Clase: ${p.titulo}`}
      desdeAbajo={p.modo === 'hoja'}
      backdropClassName={p.modo === 'hoja'
        ? 'fixed inset-0 z-50 flex flex-col justify-end bg-foreground/20'
        : undefined}
      sheetClassName={p.modo === 'hoja'
        ? 'relative flex h-[calc(100dvh-4.5rem)] w-full flex-col overflow-hidden rounded-t-[28px] bg-card shadow-[0_-12px_40px_rgba(0,0,0,0.18)]'
        // En el iPad en vertical, un lateral y no la pantalla entera: la semana sigue a la vista.
        : 'relative flex h-full w-full flex-col bg-card shadow-[-20px_0_60px_-20px_rgba(0,0,0,0.3)] md:w-[440px]'}
    >
      <div data-testid="ficha-clase" className="flex min-h-0 flex-1 flex-col">
        <Contenido {...p} />
      </div>
    </DashboardDrawer>
  );
}

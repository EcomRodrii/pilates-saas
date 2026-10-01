'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { anfitrionPortal } from '@/lib/panel-portal';

// El menú ⋯ del panel: lo que no cabe a la vista, sin esconderlo.
//
// Nació en la ficha de la clienta y lo usa también la ficha de la clase del
// Calendario. Por eso sabe decir algo más que un nombre: una `nota` bajo la
// opción («Avisa a las 5 apuntadas»), opciones apagadas con su motivo en vez de
// desaparecer, rótulos de grupo («La serie») y un pie con una explicación.

export interface AccionMenu {
  texto: string;
  icono: LucideIcon;
  onClick: () => void;
  peligro?: boolean;
  /** Raya encima: separa lo de todos los días de lo serio (baja, borrar). */
  separar?: boolean;
  /** Qué hace de verdad, en una línea más pequeña. */
  nota?: string;
  /** Se enseña apagada (con el motivo en `nota`) en vez de esconderla. */
  desactivada?: boolean;
  /** Rótulo encima de la opción, para abrir un grupo. */
  seccion?: string;
  /** Sangría: va dentro del grupo de arriba. */
  dentro?: boolean;
}

type PosicionMenu = { top?: number; bottom?: number; right: number; maxHeight: number };

function altoAproximado(acciones: AccionMenu[], pie: boolean): number {
  return acciones.reduce((a, x) => a + (x.nota ? 58 : 44) + (x.seccion ? 26 : 0) + (x.separar ? 9 : 0), 16) + (pie ? 64 : 0);
}

/**
 * Dónde se pinta el menú, pegado al botón: debajo si cabe; si no, por donde haya
 * más sitio, con su propio scroll si ni así cabe entero (nunca fuera de la pantalla).
 */
function posicionDelMenu(boton: HTMLElement, alto: number, arriba: boolean | undefined): PosicionMenu {
  const r = boton.getBoundingClientRect();
  const vh = window.innerHeight;
  const right = Math.max(8, window.innerWidth - r.right);
  const libreAbajo = vh - r.bottom - 14;
  const libreArriba = r.top - 14;
  const haciaArriba = arriba || (alto > libreAbajo && libreArriba > libreAbajo);
  return haciaArriba
    ? { bottom: vh - r.top + 6, right, maxHeight: Math.max(120, libreArriba) }
    : { top: r.bottom + 6, right, maxHeight: Math.max(120, libreAbajo) };
}

export function MenuAcciones({ acciones, arriba, boton, claseBoton, etiqueta = 'Más acciones', titulo, pie, ancho = 'normal' }: {
  acciones: AccionMenu[];
  /** Se abre hacia arriba (la barra de selección vive pegada abajo). */
  arriba?: boolean;
  /** Lo que se pinta en el botón; por defecto, los tres puntos. */
  boton?: ReactNode;
  claseBoton?: string;
  etiqueta?: string;
  /** Rótulo pequeño en lo alto del menú: de qué es («Carmen López»). */
  titulo?: string;
  /** Una explicación al final, sin acción. */
  pie?: string;
  ancho?: 'normal' | 'ancho';
}) {
  // El menú se pinta en el anfitrión de portales del panel, con posición fija
  // calculada desde el botón: dentro de la tarjeta, su `overflow-hidden` (o el
  // scroll del panel lateral) lo recortaba y las últimas opciones no se veían.
  const [pos, setPos] = useState<PosicionMenu | null>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const abierto = pos !== null;
  const alto = altoAproximado(acciones, !!pie) + (titulo ? 28 : 0);

  function abrir() {
    if (botonRef.current) setPos(posicionDelMenu(botonRef.current, alto, arriba));
  }

  useEffect(() => {
    if (!abierto) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus({ preventScroll: true });
    function fuera(e: MouseEvent) {
      const t = e.target as Node;
      if (!botonRef.current?.contains(t) && !menuRef.current?.contains(t)) setPos(null);
    }
    // En captura y cortando la propagación: Esc cierra el MENÚ y nada más. Sin
    // esto, dentro de un cajón (la ficha de la clase en el iPad) el cajón lo oía
    // también y se cerraba entero, o la vista ampliada del panel volvía a su tamaño.
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); setPos(null); botonRef.current?.focus(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])];
      if (items.length === 0) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      items[e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1)].focus();
    }
    // Al desplazarse la página el menú SIGUE al botón (cerrarlo con cualquier
    // scroll lo hacía inalcanzable si aún se movía la página, o si había que
    // bajar para llegar a la última opción). Solo se cierra si el botón sale de
    // la pantalla. Lo que se desplaza dentro del propio menú no cuenta.
    function alMoverse(e: Event) {
      if (e.target instanceof Node && menuRef.current?.contains(e.target)) return;
      const b = botonRef.current;
      const r = b?.getBoundingClientRect();
      if (!b || !r || r.bottom < 0 || r.top > window.innerHeight) { setPos(null); return; }
      setPos(posicionDelMenu(b, alto, arriba));
    }
    document.addEventListener('mousedown', fuera);
    window.addEventListener('keydown', tecla, true);
    window.addEventListener('resize', alMoverse);
    window.addEventListener('scroll', alMoverse, true);
    return () => {
      document.removeEventListener('mousedown', fuera);
      window.removeEventListener('keydown', tecla, true);
      window.removeEventListener('resize', alMoverse);
      window.removeEventListener('scroll', alMoverse, true);
    };
  }, [abierto, alto, arriba]);

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        onClick={() => (abierto ? setPos(null) : abrir())}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-label={etiqueta}
        title={etiqueta}
        className={claseBoton ?? 'flex h-full min-h-12 w-12 items-center justify-center rounded-xl border border-border bg-card text-foreground hover:bg-muted md:min-h-10 md:w-10'}
      >
        {boton ?? <MoreHorizontal size={18} />}
      </button>
      {pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={etiqueta}
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, right: pos.right, maxHeight: pos.maxHeight }}
          className={cn(
            'z-50 max-w-[calc(100vw-16px)] overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg',
            ancho === 'ancho' ? 'w-[19rem]' : 'w-64',
          )}
        >
          {titulo && (
            <p className="truncate px-3 pt-2 pb-1 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
          )}
          {acciones.map((a) => (
            <div key={a.texto}>
              {a.separar && <div className="my-1 h-px bg-border" />}
              {a.seccion && <p className="px-3 pt-1.5 pb-0.5 text-[11.5px] font-semibold text-muted-foreground">{a.seccion}</p>}
              <button
                role="menuitem"
                type="button"
                disabled={a.desactivada}
                onClick={() => { setPos(null); a.onClick(); }}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13.5px] font-medium outline-none focus-visible:bg-muted disabled:cursor-not-allowed disabled:opacity-50',
                  a.dentro && 'pl-8',
                  a.peligro ? 'text-destructive enabled:hover:bg-destructive/10 focus-visible:bg-destructive/10' : 'text-foreground enabled:hover:bg-muted',
                )}
              >
                <a.icono size={16} aria-hidden className={cn('mt-px shrink-0', !a.peligro && 'text-muted-foreground')} />
                <span className="min-w-0">
                  <span className="block">{a.texto}</span>
                  {a.nota && <span className="mt-0.5 block text-[12px] font-normal leading-snug text-muted-foreground text-pretty">{a.nota}</span>}
                </span>
              </button>
            </div>
          ))}
          {pie && (
            <>
              <div className="my-1 h-px bg-border" />
              <p className="px-3 py-2 text-[12.5px] leading-snug text-muted-foreground text-pretty">{pie}</p>
            </>
          )}
        </div>,
        anfitrionPortal(),
      )}
    </>
  );
}

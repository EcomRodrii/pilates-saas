'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { anfitrionPortal } from '@/lib/panel-portal';
import type { NavHijoDef } from '@/lib/nav-config';

// Una entrada del menú con un desplegable lateral, como «Apps e integraciones»
// de Momence: al pasar el ratón por encima sale una tarjeta flotante con sus
// páginas, agrupadas, cada una con una línea que dice qué hay dentro.
//
// Cómo se abre (las tres, y todas llegan al mismo sitio):
//   · ratón: al pasar por encima, con una espera corta para no abrirse al cruzar
//     el menú de camino a otra cosa, y otra al salir para poder cruzar el hueco
//     hasta la tarjeta sin que se cierre;
//   · dedo y clic: pulsar la entrada la abre y la deja fija hasta pulsar fuera;
//   · teclado: Intro o flecha derecha la abre y lleva el foco a la primera página.
//
// Va en un portal con posición fija, calculada desde el botón: el menú lateral
// hace scroll y un hijo absoluto quedaría recortado. Mismo patrón que
// MenuAcciones. El botón NO navega: las páginas son enlaces de verdad.

interface Pos { top: number; left: number; maxHeight: number }

const ESPERA_ABRIR = 90;
const ESPERA_CERRAR = 180;

function posicion(boton: HTMLElement): Pos {
  const r = boton.getBoundingClientRect();
  const vh = window.innerHeight;
  // 330 ≈ lo que mide la tarjeta con sus tres grupos: si no cabe debajo de la entrada, sube.
  const top = Math.max(8, Math.min(r.top - 10, vh - 330));
  return { top, left: r.right, maxHeight: Math.max(160, vh - top - 12) };
}

export function NavItemConHijos({ href, label, Icon, hijos, collapsed, horizontal, nuevo }: {
  href: string;
  label: string;
  Icon: React.ElementType;
  hijos: readonly NavHijoDef[];
  collapsed?: boolean;
  horizontal?: boolean;
  nuevo?: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  const [pos, setPos] = useState<Pos | null>(null);
  // «Fijo»: abierto con un clic o con el teclado; el ratón saliendo ya no lo cierra.
  const [fijo, setFijo] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const tarjeta = useRef<HTMLDivElement>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abierto = pos !== null;

  const limpiar = () => { if (temporizador.current) { clearTimeout(temporizador.current); temporizador.current = null; } };
  const cerrar = useCallback(() => { limpiar(); setFijo(false); setPos(null); }, []);
  const abrir = useCallback(() => { limpiar(); if (boton.current) setPos(posicion(boton.current)); }, []);
  const abrirConEspera = () => { limpiar(); temporizador.current = setTimeout(abrir, ESPERA_ABRIR); };
  const cerrarConEspera = () => { limpiar(); if (fijo) return; temporizador.current = setTimeout(() => setPos(null), ESPERA_CERRAR); };

  // Navegar cierra la tarjeta. Se ajusta durante el render (la ruta cambió) y no en un efecto:
  // así no hay un fotograma con la tarjeta abierta sobre la página nueva.
  const [rutaVista, setRutaVista] = useState(pathname);
  if (rutaVista !== pathname) { setRutaVista(pathname); if (pos) { setFijo(false); setPos(null); } }

  useEffect(() => () => limpiar(), []);

  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent) {
      const t = e.target as Node;
      if (!boton.current?.contains(t) && !tarjeta.current?.contains(t)) cerrar();
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); cerrar(); boton.current?.focus(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = [...(tarjeta.current?.querySelectorAll<HTMLAnchorElement>('a') ?? [])];
      if (items.length === 0) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLAnchorElement);
      items[e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1)].focus();
    }
    function alMoverse(e: Event) {
      if (e.target instanceof Node && tarjeta.current?.contains(e.target)) return;
      const b = boton.current;
      const r = b?.getBoundingClientRect();
      if (!b || !r || r.bottom < 0 || r.top > window.innerHeight) { cerrar(); return; }
      setPos(posicion(b));
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
  }, [abierto, cerrar]);

  return (
    <>
      <button
        ref={boton}
        type="button"
        onMouseEnter={abrirConEspera}
        onMouseLeave={cerrarConEspera}
        onClick={() => { if (abierto && fijo) { cerrar(); } else { setFijo(true); abrir(); } }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault(); setFijo(true); abrir();
            requestAnimationFrame(() => tarjeta.current?.querySelector<HTMLAnchorElement>('a')?.focus({ preventScroll: true }));
          }
        }}
        aria-expanded={abierto}
        aria-haspopup="menu"
        title={collapsed ? label : undefined}
        className={cn(
          'zona-tactil flex w-full items-center rounded-full text-[13px] font-medium transition-all',
          collapsed ? 'justify-center w-10 h-10 mx-auto tactil:size-11' : 'gap-2.5 px-3 py-2 tactil:min-h-11',
          horizontal && 'shrink-0 whitespace-nowrap w-auto',
          active
            ? 'bg-brand text-brand-foreground font-semibold'
            : abierto ? 'bg-card/10 text-white/90' : 'text-white/45 hover:text-white/80 hover:bg-card/5',
        )}
      >
        <Icon size={17} className="shrink-0" strokeWidth={active ? 2.5 : 2} />
        {!collapsed && <span className="truncate">{label}</span>}
        {!collapsed && nuevo && <span className="ml-1 rounded-md bg-card/15 px-1.5 text-[10px] font-bold uppercase">Nuevo</span>}
        {!collapsed && !horizontal && <ChevronRight size={14} aria-hidden className={cn('ml-auto shrink-0 opacity-60 transition-transform', abierto && 'translate-x-0.5 opacity-90')} />}
      </button>
      {pos && createPortal(
        // El contenedor exterior llega hasta el menú (su `pl-2` es transparente): al cruzar el
        // hueco entre la entrada y la tarjeta el ratón sigue «dentro» y no se cierra.
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, maxHeight: pos.maxHeight }}
          className="z-50 pl-2"
          onMouseEnter={limpiar}
          onMouseLeave={cerrarConEspera}
        >
          <div
            ref={tarjeta}
            role="menu"
            aria-label={label}
            data-testid="desplegable-apps"
            className="w-[19rem] max-w-[calc(100vw-24px)] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-[0_18px_44px_-16px_color-mix(in_srgb,var(--foreground)_38%,transparent)] motion-safe:animate-[desplegable-entra_.14s_ease-out]"
          >
            <p className="px-3 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
            <div className="mx-3 mb-1 h-px bg-border" />
            {hijos.map((h, i) => {
              const activo = pathname === h.href || (h.href !== href && pathname.startsWith(`${h.href}/`));
              const rotulo = h.grupo && (i === 0 || hijos[i - 1].grupo !== h.grupo) ? h.grupo : null;
              return (
                <div key={h.href}>
                  {rotulo && <p className="px-3 pb-0.5 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/80">{rotulo}</p>}
                  <Link
                    href={h.href}
                    role="menuitem"
                    onClick={cerrar}
                    aria-current={activo ? 'page' : undefined}
                    className={cn(
                      'block rounded-xl px-3 py-2 outline-none transition-colors focus-visible:bg-muted hover:bg-muted',
                      activo && 'bg-[color:color-mix(in_srgb,var(--t-blue-500)_10%,var(--popover))]',
                    )}
                  >
                    <span className={cn('block text-[14px] font-medium leading-snug', activo ? 'text-[color:var(--t-text-link)]' : 'text-foreground')}>{h.label}</span>
                    {h.nota && <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">{h.nota}</span>}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>,
        anfitrionPortal(),
      )}
    </>
  );
}

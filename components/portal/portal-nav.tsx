'use client';

// Barra inferior del portal cliente — presentación pura, extraída de
// portal-shell.tsx (Theme Builder — Fase 2) para poder reutilizarla tanto en
// el armazón real (interactive, con Links de verdad) como en el preview en
// vivo del editor de temas (interactive=false, mismo componente exacto para
// que lo que ve la propietaria sea idéntico a lo que verá su clienta).
//
// Icono + texto en la pestaña activa, solo icono en las demás — antes era el
// look opt-in del tema "Editorial" (`tabBarStyle: 'pestanaActiva'`); tras el
// rediseño de 2026-08 (feedback directo de 49 propietarias: "no parece una
// app moderna") pasa a ser el ÚNICO look de la barra, para todos los
// estudios sin excepción. El campo `tabBarStyle` se queda en el esquema del
// tema (lib/theme-schema.ts) solo para que temas ya guardados sigan
// resolviendo sin romper — este componente ya no lo lee.
//
// Resuelve nombre de icono → componente (lib/portal-nav.ts es puro, sin
// React) — mismo criterio que bloque-home-render.tsx con portal-home-bloques.ts.

import Link from 'next/link';
import {
  Home, CalendarDays, Ticket, Video, User, Star, Heart, Bell, MessageCircle, Sparkles, MapPin, Dumbbell,
  type LucideIcon,
} from 'lucide-react';
import { useModo } from '@/lib/portal-modo';
import { EASE, dur, texto, radio, altura, sombra, cristal, desenfoque } from '@/lib/portal-design';
import type { NavItemDefault } from '@/lib/portal-nav';

const ICONOS: Record<string, LucideIcon> = {
  Home, CalendarDays, Ticket, Video, User, Star, Heart, Bell, MessageCircle, Sparkles, MapPin, Dumbbell,
};

export function PortalNav({
  items, activeIndex, slug, interactive = true,
}: {
  items: NavItemDefault[];
  activeIndex: number;
  slug: string;
  /** false = widget de preview del editor: mismo look, sin navegar de verdad. */
  interactive?: boolean;
}) {
  const { t, noche } = useModo();

  return (
    <nav
      aria-label="Secciones"
      style={{
        position: interactive ? 'absolute' : 'relative',
        left: interactive ? 18 : undefined, right: interactive ? 18 : undefined,
        bottom: interactive ? 'calc(22px + env(safe-area-inset-bottom))' : undefined,
        // var() con el valor de hoy como fallback en las 3: sin `barraOscura`/
        // `barraFlotante` el tema no declara estas vars (ver varsBarra/
        // varsBarraFlotante en lib/theme-runtime.ts) y la barra se ve
        // exactamente igual que antes, en claro y en oscuro.
        height: `var(--portal-tabbar-height, ${altura.tabbar}px)`,
        zIndex: interactive ? 14 : undefined,
        borderRadius: `var(--portal-tabbar-radius, ${radio.tabbar}px)`,
        background: `var(--portal-tabbar-bg, ${t.tabbar})`,
        ...cristal(desenfoque.tabbar, 170),
        border: `1px solid ${noche ? 'rgba(243,241,233,.10)' : 'rgba(255,255,255,.85)'}`,
        boxShadow: `var(--portal-tabbar-shadow, ${sombra.tabbar})`,
        display: 'flex', alignItems: 'center', padding: 6,
      }}
    >
      {items.map((item, i) => {
        const Icon = ICONOS[item.icono] ?? Home;
        const active = i === activeIndex;
        // `overflow: hidden` vive en el CONTENIDO, no en el propio Link/span:
        // puesto en el mismo elemento que recibe el foco de teclado, recorta
        // también su anillo de foco por defecto — con la barra ya reducida a
        // solo-icono en las pestañas inactivas, ese anillo es la única pista
        // de cuál está seleccionada al navegar sin ratón.
        const estilo: React.CSSProperties = {
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          flex: active ? '2.4 1 0%' : '1 1 0%',
          height: altura.tabbar - 12, borderRadius: radio.pastilla,
          background: active ? `var(--portal-tabbar-active-bg, ${noche ? t.surface2 : '#FFFFFF'})` : 'transparent',
          boxShadow: active ? `var(--portal-tabbar-active-shadow, ${sombra.pastilla})` : 'none',
          color: active ? `var(--portal-tabbar-active-fg, ${t.ink})` : `var(--portal-tabbar-idle-fg, ${t.muted})`,
          textDecoration: 'none',
          transition: `flex-grow ${dur.tab}ms ${EASE}, background ${dur.tab}ms ${EASE}, color 350ms ease`,
          outlineOffset: 2,
        };
        const contenido = (
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, overflow: 'hidden', maxWidth: '100%' }}>
            <Icon size={18} strokeWidth={active ? 2.25 : 2} style={{ flexShrink: 0 }} />
            {active && <span style={{ ...texto.tab, whiteSpace: 'nowrap' }}>{item.label}</span>}
          </span>
        );
        return interactive ? (
          <Link
            key={item.seg}
            href={`/portal/${slug}/${item.seg}`}
            aria-current={active ? 'page' : undefined}
            aria-label={item.label}
            style={estilo}
          >
            {contenido}
          </Link>
        ) : (
          <span key={item.seg} aria-label={item.label} style={estilo}>{contenido}</span>
        );
      })}
    </nav>
  );
}

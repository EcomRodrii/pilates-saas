'use client';

// Barra inferior del portal cliente — presentación pura, extraída de
// portal-shell.tsx (Theme Builder — Fase 2) para poder reutilizarla tanto en
// el armazón real (interactive, con Links de verdad) como en el preview en
// vivo del editor de temas (interactive=false, mismo componente exacto para
// que lo que ve la propietaria sea idéntico a lo que verá su clienta).
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
import type { TabBarStyleId } from '@/lib/theme-schema';

const ICONOS: Record<string, LucideIcon> = {
  Home, CalendarDays, Ticket, Video, User, Star, Heart, Bell, MessageCircle, Sparkles, MapPin, Dumbbell,
};

export function PortalNav({
  items, activeIndex, tabBarStyle, slug, interactive = true,
}: {
  items: NavItemDefault[];
  activeIndex: number;
  tabBarStyle: TabBarStyleId;
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
        height: altura.tabbar, zIndex: interactive ? 14 : undefined, borderRadius: radio.tabbar,
        background: t.tabbar,
        ...cristal(desenfoque.tabbar, 170),
        border: `1px solid ${noche ? 'rgba(243,241,233,.10)' : 'rgba(255,255,255,.85)'}`,
        boxShadow: sombra.tabbar,
        display: 'flex', alignItems: 'center', padding: 6,
      }}
    >
      {tabBarStyle === 'pestanaActiva' ? (
        // Tema "Editorial": sin pastilla deslizante de fondo — cada pestaña
        // lleva su propio icono siempre, y solo la activa se ensancha
        // (flex-grow animado) y muestra su nombre junto al icono.
        items.map((item, i) => {
          const Icon = ICONOS[item.icono] ?? Home;
          const active = i === activeIndex;
          const estilo: React.CSSProperties = {
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            flex: active ? '2.4 1 0%' : '1 1 0%',
            height: altura.tabbar - 12, borderRadius: radio.pastilla,
            background: active ? (noche ? t.surface2 : '#FFFFFF') : 'transparent',
            boxShadow: active ? sombra.pastilla : 'none',
            color: active ? t.ink : t.muted, textDecoration: 'none', overflow: 'hidden',
            transition: `flex-grow ${dur.tab}ms ${EASE}, background ${dur.tab}ms ${EASE}, color 350ms ease`,
          };
          const contenido = (
            <>
              <Icon size={18} strokeWidth={active ? 2.25 : 2} style={{ flexShrink: 0 }} />
              {active && <span style={{ ...texto.tab, whiteSpace: 'nowrap' }}>{item.label}</span>}
            </>
          );
          return interactive ? (
            <Link key={item.seg} href={`/portal/${slug}/${item.seg}`} aria-current={active ? 'page' : undefined} style={estilo}>
              {contenido}
            </Link>
          ) : (
            <span key={item.seg} style={estilo}>{contenido}</span>
          );
        })
      ) : (
        <>
          {/* La pastilla. Se mueve solo con `transform` — nunca con `left`, que
              obliga a recalcular disposición en cada frame y en Safari de iOS se
              nota. El ancho sale del número de pestañas visibles, así que
              ocultar una no descuadra las demás. */}
          {activeIndex >= 0 && (
            <span
              aria-hidden
              style={{
                position: 'absolute', left: 6, top: 6, bottom: 6,
                width: `calc((100% - 12px) / ${items.length})`,
                borderRadius: radio.pastilla, background: noche ? t.surface2 : '#FFFFFF',
                boxShadow: sombra.pastilla, pointerEvents: 'none',
                transform: `translateX(${activeIndex * 100}%)`,
                transition: `transform ${dur.tab}ms ${EASE}`,
                willChange: 'transform',
              }}
            />
          )}

          {items.map((item, i) => {
            const active = i === activeIndex;
            const estilo: React.CSSProperties = {
              position: 'relative', flex: 1, textAlign: 'center', ...texto.tab,
              color: active ? t.ink : t.muted, textDecoration: 'none',
              transition: 'color 350ms ease',
            };
            return interactive ? (
              <Link key={item.seg} href={`/portal/${slug}/${item.seg}`} aria-current={active ? 'page' : undefined} style={estilo}>
                {item.label}
              </Link>
            ) : (
              <span key={item.seg} style={estilo}>{item.label}</span>
            );
          })}
        </>
      )}
    </nav>
  );
}

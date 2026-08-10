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
// `flotante` (prop, no CSS var) reabre esa decisión SOLO para Oliva/Noir
// (campo `barraClasica` del tema, ver theme-schema.ts) — confirmado
// explícitamente con el usuario tras comparar contra el prototipo real, que
// para esos dos temas usa una barra pegada abajo con borde superior, no la
// píldora flotante. El resto de estudios (default `flotante=true`) no
// cambia — la pestaña activa/icono+texto tampoco cambia en ningún caso.
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
  items, activeIndex, slug, interactive = true, flotante = true, etiquetas = 'soloActiva',
}: {
  items: NavItemDefault[];
  activeIndex: number;
  slug: string;
  /** false = widget de preview del editor: mismo look, sin navegar de verdad. */
  interactive?: boolean;
  /** false = barra clásica (Oliva/Noir): pegada abajo, sin flotar, con borde
   *  superior en vez de cápsula de cristal. Ver `barraClasica` del tema. */
  flotante?: boolean;
  /**
   * Qué pestañas muestran su etiqueta (eje `barra` de lib/theme-variantes.ts):
   *  · `soloActiva` (default) — el look de siempre, y el que mantiene TODO
   *    estudio que no pida otra cosa. Es también lo que pide el prototipo
   *    para la barra en píldora (`conTexto: !tabPill || activo`).
   *  · `todas` — las cuatro con su nombre, como el prototipo pinta la barra
   *    clásica de Oliva/Noir.
   *  · `todasRelleno` — igual, y además el icono activo va MACIZO (Oliva).
   */
  etiquetas?: 'soloActiva' | 'todas' | 'todasRelleno';
}) {
  const { t, noche } = useModo();
  // `interactive` decide la MECÁNICA de posición (absolute con desplazamiento
  // propio vs relative — el widget de preview ya vive dentro de un contenedor
  // que lo coloca, no necesita posicionarse solo). `flotante` decide el
  // ASPECTO (cápsula de cristal vs barra clásica con borde) — son ejes
  // independientes: la miniatura de la biblioteca de temas es `interactive
  // ={false}` pero SÍ debe mostrar a Bloom como cápsula flotante.
  const posicionaSola = interactive && flotante;
  const todasConTexto = etiquetas !== 'soloActiva';

  return (
    <nav
      aria-label="Secciones"
      style={{
        position: posicionaSola ? 'absolute' : 'relative',
        left: posicionaSola ? 18 : undefined, right: posicionaSola ? 18 : undefined,
        bottom: posicionaSola ? 'calc(22px + env(safe-area-inset-bottom))' : undefined,
        // var() con el valor de hoy como fallback en las 3: sin `barraOscura`/
        // `barraFlotante` el tema no declara estas vars (ver varsBarra/
        // varsBarraFlotante en lib/theme-runtime.ts) y la barra se ve
        // exactamente igual que antes, en claro y en oscuro.
        // ⚠️ El hueco de la pantalla (isla dinámica, barra de gestos) se SUMA
        // al alto, no se come de él.
        //
        // Con `height: 58px` y `padding-bottom: calc(6px + safe-area)`, y
        // `box-sizing: border-box` de fábrica, en un iPhone con 34px de hueco
        // sólo quedaban 12px para iconos y etiquetas: la barra salía aplastada
        // y el contenido, recortado. La barra flotante no lo sufre porque no
        // lleva ese relleno (flota por encima del hueco, no dentro de él).
        height: flotante && interactive
          ? `var(--portal-tabbar-height, ${altura.tabbar}px)`
          : `calc(var(--portal-tabbar-height, ${altura.tabbar}px) + env(safe-area-inset-bottom))`,
        zIndex: interactive ? 14 : undefined,
        borderRadius: flotante ? `var(--portal-tabbar-radius, ${radio.tabbar}px)` : 0,
        background: `var(--portal-tabbar-bg, ${t.tabbar})`,
        ...(flotante ? cristal(desenfoque.tabbar, 170) : {}),
        border: flotante
          ? `1px solid ${noche ? 'rgba(243,241,233,.10)' : 'rgba(255,255,255,.85)'}`
          // `--portal-tabbar-border` es la LÍNEA entera, no solo su color: la
          // barra oscura la quita del todo (ver varsBarra) y con un color
          // transparente seguiría reservando su píxel de alto.
          : `var(--portal-tabbar-border, 1px solid ${t.line})`,
        // Con `--portal-tabbar-border: none` el estilo del borde ya es `none`,
        // así que este ancho no pinta nada — solo acota la línea al lado de
        // arriba cuando SÍ hay borde.
        borderWidth: flotante ? '1px' : '1px 0 0 0',
        boxShadow: flotante ? `var(--portal-tabbar-shadow, ${sombra.tabbar})` : 'none',
        display: 'flex', alignItems: 'center', padding: 6,
        paddingBottom: flotante && interactive ? 6 : 'calc(6px + env(safe-area-inset-bottom))',
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
          // El 2.4 de la activa existe SOLO para hacerle sitio a su texto
          // cuando es la única que lo lleva; con todas etiquetadas, ensancharla
          // dejaría a las otras tres apretadas y sin razón.
          flex: todasConTexto ? '1 1 0%' : (active ? '2.4 1 0%' : '1 1 0%'),
          // ⚠️ El alto sale de la MISMA fuente que el de la barra, y con tope.
          //
          // Antes era la constante de JS (`altura.tabbar - 12` = 46px) mientras
          // la barra tomaba el suyo de `--portal-tabbar-height`, que el tema
          // puede subir. Si además la barra es clásica —pegada abajo, con el
          // hueco de la isla dinámica sumado al relleno— esos 66px INCLUYEN el
          // relleno (`box-sizing: border-box`), el hueco interior se queda en
          // ~20px y las pastillas de 46 asomaban por encima del borde.
          //
          // Pasó de verdad: un estudio con `themeId: bloom` guardado con
          // `barraClasica` Y `barraFlotante` a la vez (residuo de instalar un
          // tema encima de otro, arreglado ya en `instalarTema`). El dato
          // guardado sigue ahí, así que la barra tiene que aguantarlo.
          height: `calc(var(--portal-tabbar-height, ${altura.tabbar}px) - 12px)`,
          maxHeight: '100%',
          borderRadius: radio.pastilla,
          background: active ? `var(--portal-tabbar-active-bg, ${noche ? t.surface2 : '#FFFFFF'})` : 'transparent',
          boxShadow: active ? `var(--portal-tabbar-active-shadow, ${sombra.pastilla})` : 'none',
          color: active ? `var(--portal-tabbar-active-fg, ${t.ink})` : `var(--portal-tabbar-idle-fg, ${t.muted})`,
          textDecoration: 'none',
          transition: `flex-grow ${dur.tab}ms ${EASE}, background ${dur.tab}ms ${EASE}, color 350ms ease`,
          outlineOffset: 2,
        };
        const contenido = (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 7, overflow: 'hidden', maxWidth: '100%',
            // Con las cuatro etiquetadas el texto va DEBAJO del icono (es lo
            // que hace el prototipo, y en fila no cabrían cuatro nombres).
            ...(todasConTexto ? { flexDirection: 'column', gap: 5 } : {}),
          }}>
            <Icon
              size={18}
              strokeWidth={active ? 2.25 : 2}
              style={{
                flexShrink: 0,
                // Prop, no CSS var: la var la emitiría ThemeStyle, un
                // componente de SERVIDOR que lee Supabase — no llega ni al
                // arnés de e2e ni a ningún preview que no aplique
                // themeToCssVars() en línea. `etiquetas` ya viaja hasta aquí,
                // así que decidirlo con ella es más simple y sí se puede
                // probar.
                fill: active && etiquetas === 'todasRelleno' ? 'currentColor' : 'none',
              }}
            />
            {(active || todasConTexto) && (
              <span style={{ ...texto.tab, whiteSpace: 'nowrap', ...(todasConTexto ? { fontSize: 10.5 } : {}) }}>
                {item.label}
              </span>
            )}
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

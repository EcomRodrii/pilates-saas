'use client';

// Miniatura de un tema — el Inicio del portal pintado en pequeño, para poder
// COMPARAR temas de un vistazo en la biblioteca.
//
// Por qué no un iframe: la biblioteca enseña 6+ temas a la vez, y cada iframe
// de /portal-preview pide su propio token firmado y su propia carga del
// catálogo del estudio. Aquí no hace falta fidelidad al dato (no se está
// editando nada todavía), solo al ASPECTO: se pinta con los mismos tokens de
// lib/portal-design.ts y las mismas CSS vars que produce themeToCssVars(), así
// que un cambio de tema se ve exactamente donde toca. La vista previa fiel
// sigue siendo el iframe real del editor (HomePreview) — regla 2 del encargo.
//
// Reglas de geometría aprendidas al diseñarlo, no tocar a la ligera:
//  · El marco mide ANCHO×ALTO fijos y los hijos van a `flex: none`; con menos
//    alto, el botón de la tarjeta se recorta — y es justo lo que distingue un
//    tema de otro (relleno sólido vs contorno, esquinas rectas vs cápsula).
//  · El contenedor externo mide `ceil(ALTO * escala)`: si mide menos, se come
//    la barra inferior, que es donde se ve `barraOscura`.
//  · Nada de barras grises de relleno: texto real, para que la tipografía del
//    tema se pueda juzgar.

import { themeToCssVars } from '@/lib/theme-runtime';
import { display, texto, micro, radio, altura, sombra } from '@/lib/portal-design';
import { resolveNavConfig, navItemsVisibles, NAV_DISPONIBLES } from '@/lib/portal-nav';
import { PortalNav } from '@/components/portal/portal-nav';
import type { ThemeConfig } from '@/lib/theme-schema';

// Ancho real del portal en el móvil de referencia, y alto que hace falta para
// que quepa la barra inferior sin recortar el botón de la tarjeta.
const ANCHO = 392;
const ALTO = 565;

export function ThemeThumb({ config, ancho = 96 }: { config: ThemeConfig; ancho?: number }) {
  const escala = ancho / ANCHO;
  const vars = themeToCssVars(config) as React.CSSProperties;
  const items = navItemsVisibles(resolveNavConfig(config.navPortal), NAV_DISPONIBLES);

  return (
    <div
      aria-hidden
      style={{
        width: ancho,
        height: Math.ceil(ALTO * escala),
        borderRadius: 10,
        overflow: 'hidden',
        border: '1px solid var(--border)',
        flex: 'none',
        // Las vars del tema se declaran AQUÍ, no en :root — así conviven varias
        // miniaturas de temas distintos en la misma pantalla sin pisarse.
        ...vars,
      }}
    >
      <div
        style={{
          width: ANCHO,
          height: ALTO,
          transform: `scale(${escala})`,
          transformOrigin: 'top left',
          background: config.background,
          color: config.text,
          display: 'flex',
          flexDirection: 'column',
          padding: '26px 22px 0',
          position: 'relative',
        }}
      >
        {/* Saludo */}
        <div style={{ flex: 'none' }}>
          <div style={{ ...micro(11, 0.28), color: config.text, opacity: 0.45 }}>LUNES, 3 DE AGOSTO</div>
          <div style={{ ...display(38), color: config.text, marginTop: 10 }}>Hola, Ana.</div>
        </div>

        {/* Tarjeta de próxima clase — el hueco de foto, el nombre, la hora y el
            botón. Es donde se leen a la vez la forma (radio), el estilo de
            tarjeta (sombra/borde) y el estilo de botón del tema. */}
        <div
          style={{
            flex: 'none',
            marginTop: 22,
            borderRadius: `var(--portal-radius-card, ${radio.card}px)`,
            background: config.accent,
            border: 'var(--portal-card-border, none)',
            boxShadow: 'var(--portal-card-shadow, none)',
            overflow: 'hidden',
          }}
        >
          {/* 78, no 108: con la foto más alta el contenido sumaba ~591px y se
              colaba por debajo de la barra inferior, que es justo donde se ve
              `barraOscura`. Medido, no tanteado. */}
          <div style={{ height: 78, background: config.primary, opacity: 0.14 }} />
          <div style={{ padding: '16px 18px 18px' }}>
            <div style={{ ...display(26), color: config.text }}>Pilates Reformer</div>
            <div style={{ ...texto.meta, color: config.text, opacity: 0.6, marginTop: 6 }}>
              Hoy · 18:00 · Sala 1
            </div>
            <div
              style={{
                marginTop: 16,
                height: 46,
                borderRadius: `var(--portal-radius-boton, ${radio.botonCta}px)`,
                background: 'var(--portal-btn-bg, var(--portal-brand))',
                color: 'var(--portal-btn-fg, var(--portal-brand-foreground))',
                border: 'var(--portal-btn-border, none)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                ...texto.botonCta,
                fontSize: 15,
                boxShadow: sombra.cta,
              }}
            >
              Ver mi acceso
            </div>
          </div>
        </div>

        {/* Dos filas de acceso, a lo ancho (no una rejilla de dos) — así se lee
            el interlineado y el peso del titular del tema. */}
        <div style={{ flex: 'none', marginTop: 16 }}>
          {['Reservar clase', 'Mi progreso'].map((etiqueta, i) => (
            <div
              key={etiqueta}
              style={{
                height: altura.fila,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderTop: `1px solid ${config.text}1F`,
                borderBottom: i === 1 ? `1px solid ${config.text}1F` : undefined,
              }}
            >
              <span style={{ ...display(24), color: config.text }}>{etiqueta}</span>
              <span style={{ ...texto.valor, color: config.text, opacity: 0.55 }}>
                {i === 0 ? '3 huecos hoy' : '24 clases'}
              </span>
            </div>
          ))}
        </div>

        {/* Barra inferior REAL — el mismo componente que el portal, para que
            `barraOscura` (tema Noir) se vea aquí tal cual se verá en el móvil. */}
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 14 }}>
          <PortalNav items={items} activeIndex={0} slug="preview" interactive={false} flotante={!config.barraClasica} />
        </div>
      </div>
    </div>
  );
}

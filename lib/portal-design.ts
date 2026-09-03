// El lenguaje visual del portal — REMEDIDO contra el prototipo "Tentare
// Studio App" (Plus Jakarta Sans + IBM Plex Mono, crema #FAF9F5, verde
// #3E6B4A). API idéntica a la versión anterior: mismos exports, mismas
// firmas — solo cambian los VALORES. Ninguna pantalla necesita tocarse;
// esta es la única fuente que hay que pisar para que el portal entero
// coincida con el prototipo.
//
// ⚠️ Requiere que el layout cargue:
//   Plus Jakarta Sans 400–800  → var(--font-jakarta) (ya existe en el repo)
//   IBM Plex Mono 400/500      → var(--font-plex-mono) (ya existe)

import type { CSSProperties } from 'react';

// ── Movimiento ───────────────────────────────────────────────────────────────
// Curva del prototipo: rápida al salir, frenada suave, sin rebote.
export const EASE = 'cubic-bezier(.2,.7,0,1)';

export const dur = {
  color: 200,
  control: 250,    // press-scale de botones y cards
  card: 400,       // apUp: entrada de cards (fade + translateY 14px)
  tab: 320,        // píldora del menú inferior
  sheet: 380,      // bottom sheets (con cubic-bezier(.34,1.3,.5,1) si hay spring)
  wash: 600,
  washInner: 1100,
  portada: 700,
  foco: 250,
  // ⚠️ NO viene en el zip del kit, pero components/portal/portal-home-view.tsx
  // lo consume para el Ken Burns de la foto del hero (un bucle continuo, no un
  // fundido de una vez): sin él el portal real no compila.
  heroFoto: 20000,
} as const;

export function transicion(props: string[], ms: number = dur.control): string {
  return props.map((p) => `${p} ${ms}ms ${EASE}`).join(', ');
}

// ── Tipografía ───────────────────────────────────────────────────────────────
// El prototipo NO usa serif: los titulares son Jakarta 800 con tracking
// apretado (-.03em). El papel de "voz" que hacía la serif lo hace el peso.
// `serif` se mantiene como export para no romper imports, pero apunta a
// Jakarta — el fallback del tema sigue funcionando.
export const serif = "var(--portal-heading-font, var(--font-jakarta)), 'Plus Jakarta Sans', system-ui, sans-serif";
export const sans = "var(--font-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif";
export const mono = "var(--font-plex-mono), 'IBM Plex Mono', ui-monospace, monospace";

/** Display: Jakarta 800, tracking -0.03em. `it` se conserva (banner promocional). */
export function display(size: number | string, it = false, lh = 1.05): CSSProperties {
  return {
    fontFamily: serif, fontSize: size, fontStyle: it ? 'italic' : 'normal',
    lineHeight: lh, fontWeight: 'var(--portal-heading-weight, 800)' as any,
    letterSpacing: '-0.03em',
  };
}

export function escala(paso: PasoEscala, siNoHayTema: number): string {
  return `var(--portal-text-${paso}, ${siNoHayTema}px)`;
}

export type PasoEscala =
  | 'seccion' | 'titulo-pantalla' | 'saludo' | 'titulo-hero'
  | 'bienvenida' | 'numero-bono';

// Micro-etiquetas: en el prototipo van en IBM Plex Mono, uppercase, tracking
// .16em — no en versalitas de la sans.
export function micro(size = 10, ls = 0.16, weight = 500): CSSProperties {
  return {
    fontFamily: mono, fontSize: size, fontWeight: weight,
    letterSpacing: `${ls}em`, paddingLeft: `${ls}em`, textTransform: 'uppercase',
  };
}

export const texto = {
  meta: { fontFamily: sans, fontSize: 12.5, fontWeight: 500 } as CSSProperties,
  metaFuerte: { fontFamily: sans, fontSize: 12.5, fontWeight: 700 } as CSSProperties,
  valor: { fontFamily: sans, fontSize: 11.5, fontWeight: 500 } as CSSProperties,
  boton: { fontFamily: sans, fontSize: 14.5, fontWeight: 800, letterSpacing: '0' } as CSSProperties,
  botonCta: { fontFamily: sans, fontSize: 14.5, fontWeight: 800 } as CSSProperties,
  tab: { fontFamily: sans, fontSize: 9.5, fontWeight: 800, letterSpacing: '.01em' } as CSSProperties,
  pie: { fontFamily: sans, fontSize: 11.5, fontWeight: 400 } as CSSProperties,
  nota: { fontFamily: sans, fontSize: 11, fontWeight: 400 } as CSSProperties,
} as const;

// ── Forma ────────────────────────────────────────────────────────────────────
// El prototipo es menos redondeado que v2: cards 16–20, sheets 24, y los
// botones son cápsulas (999) de 50–52 px, no de 66.
export const radio = {
  hoja: 24,      // bottom sheets (24 24 0 0)
  botonAlto: 999,
  botonCta: 999,
  heroCard: 20,
  // ⚠️ El zip del kit traía `tabbar: 0` con el comentario «la barra del
  // prototipo es full-width con border-top, no cápsula». Es FALSO respecto al
  // propio prototipo que acompaña al kit: components/prototipo/StudioApp.jsx
  // (L1500) la pinta `border-radius:999px` flotando a 14/14/16 con
  // `box-shadow:0 16px 44px rgba(8,8,8,.25)`. Manda el JSX, que es la
  // referencia. Este token SOLO lo lee la variante flotante de portal-nav.tsx
  // (la clásica fuerza 0), así que subirlo no toca Oliva/Noir.
  tabbar: 999,
  banner: 18,
  qr: 20,
  card: 16,
  pastilla: 999,
  pill: 999,
} as const;

export const altura = {
  botonAcceso: 52,
  botonCta: 50,
  fila: 62,
  tabbar: 74,    // 9px arriba + iconos 21 + label + 24px safe-area
  topbar: 56,
  heroCard: 314,
  banner: 112,
  fotoAcceso: 290,
} as const;

// ── Sombra ───────────────────────────────────────────────────────────────────
// Tiradas de tinta neutra rgba(26,26,26,·) — el prototipo no usa sombra verde.
export const sombra = {
  hojaAcceso: '0 -18px 50px rgba(15,15,15,.25)',
  botonOscuro: '0 14px 30px -10px rgba(26,26,26,.45)',
  botonClaro: '0 4px 14px rgba(26,26,26,.05)',
  botonClaroHover: '0 10px 24px -10px rgba(26,26,26,.14)',
  heroCard: '0 18px 38px -16px rgba(18,41,26,.5)',
  cardInterna: '0 10px 24px -10px rgba(26,26,26,.14)',
  cta: '0 14px 30px -10px rgba(26,26,26,.45)',
  cardSemana: '0 14px 30px -12px rgba(26,26,26,.3)',
  cardSemanaHover: '0 22px 40px -16px rgba(26,26,26,.35)',
  banner: '0 14px 30px -14px rgba(15,15,15,.35)',
  tabbar: 'none', // la barra lleva border-top 1px #EFEDE4, no sombra
  pastilla: '0 3px 10px rgba(26,26,26,.1)',
  sheet: '0 -18px 50px rgba(15,15,15,.25)',
  circulo: '0 8px 18px -12px rgba(26,26,26,.3)',
  circuloBanner: '0 10px 22px -14px rgba(26,26,26,.4)',
  qr: '0 24px 55px -24px rgba(18,41,26,.45)',
} as const;

// ── Cristal ──────────────────────────────────────────────────────────────────
export function cristal(blur: number, sat = 150): CSSProperties {
  const f = `blur(${blur}px) saturate(${sat}%)`;
  return { backdropFilter: f, WebkitBackdropFilter: f } as CSSProperties;
}

export const desenfoque = {
  hoja: 24, topbar: 16, chip: 10, cardHero: 20, tabbar: 16, backdrop: 12,
} as const;

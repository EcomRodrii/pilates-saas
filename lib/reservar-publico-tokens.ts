// Lenguaje visual de la página pública `/reservar/[slug]` — rediseño completo
// (2026-08-26, diseño del fundador "Tentare Portal Reservas" en Claude
// Design): Plus Jakarta Sans + IBM Plex Mono, tarjetas sobre hueso cálido,
// radios/sombras suaves. Sustituye al lenguaje anterior ("Instrument Serif +
// Instrument Sans", pixel-exacto a un diseño previo) como aspecto POR DEFECTO
// de esta pantalla para todo estudio que no haya personalizado nada.
//
// Es SU PROPIO lenguaje, distinto del portal privado (`lib/portal-design.ts`,
// `lib/portal-tokens.ts`, `lib/portal-paleta.ts`): comparte la curva de
// animación con el resto del producto (se reexporta de aquí, no se duplica),
// pero tipografía, neutros, radios, sombras y el patrón de espaciado
// responsive (clamp()+cqw en vez de media queries) son propios de esta
// pantalla — el mismo criterio que ya declaraba este fichero, ahora aplicado
// a una paleta y tipografía NUEVAS en vez de las que tomaba prestadas de
// `portal-paleta.ts`. Los neutros viven en `RESERVAR_PALETA` (abajo), no en
// `MODO_TOKENS`: cambiarlos aquí nunca toca el portal privado de la clienta.
//
// El color de marca (botones, chips activos) sigue siendo `--portal-brand`
// (white-label por estudio, decisión ya cerrada) — el `--acento` del diseño
// original (verde `#3E6B4A`) era el de una marca de ejemplo, "Pilates
// Boutique", no un valor fijo a adoptar.
import type { CSSProperties } from 'react';
import { EASE } from './portal-design.ts';
import type { Modo, ModoTokens } from './portal-paleta.ts';
import { radiosDe, coloresDe, familiaCss, familiaDisplayCss, type AparienciaWidget } from './reservar/apariencia-widget.ts';

export { EASE };

// ── Tipografía ───────────────────────────────────────────────────────────────
// Plus Jakarta Sans para TODO (cuerpo y titulares — el diseño no usa una
// serif; los titulares son la misma familia a peso 800, no otra voz). Ya
// cargada globalmente por next/font (`app/layout.tsx`, `--font-jakarta`),
// así que no hace falta una petición nueva a Google Fonts.
// `serif` conserva el NOMBRE (lo importan ~70 sitios como "la fuente de
// titulares") para no encadenar un rename de gran alcance — pero ya no es
// una serif: es la misma familia que `sans`, diferenciada por peso en cada
// sitio de uso, tal como pide el diseño.
//
// ⚠️ **`var(--font-ui, …)`/`var(--portal-heading-font, …)` NO son decorativos
// — son el mecanismo real de personalización tipográfica por estudio**
// (`apariencia-widget.ts`, campos `fuente`/`fuenteDisplay`). Modo B
// (`app/widget-bundle/main.tsx`) fija esas dos custom properties SIEMPRE en
// la raíz del Shadow DOM (con su propio fallback, Instrument Sans/Serif —
// Modo B queda fuera de este rediseño a propósito) y depende de que `sans`/
// `serif` las LEAN; quitar el `var(...)` de en medio (como hizo un intento
// anterior de este cambio) deja "personalizar la tipografía del widget" sin
// efecto, sin que ningún tipo lo avise — encontrado por el e2e
// `reservar-acoplar-widget.spec.ts` ("widgetFuenteDisplay resucitado"), no a
// simple vista. El *fallback* (lo que se ve sin personalizar) es lo único
// que cambia aquí, de Instrument a Jakarta — vía `--font-ui`/
// `--portal-heading-font` redefinidas a `var(--font-jakarta)` en el `:root`
// que emite `paletaReservarCssText` (usado solo por Modo A,
// `/reservar/[slug]/layout.tsx`) — no aquí, y no globalmente en `<html>`
// (eso cambiaría también el portal privado).
export const sans = "var(--font-ui, var(--font-jakarta)), 'Plus Jakarta Sans', system-ui, sans-serif";
export const serif = "var(--portal-heading-font, var(--font-jakarta)), 'Plus Jakarta Sans', system-ui, sans-serif";
/** IBM Plex Mono — las etiquetas en versalitas (fecha, franja, "plazas libres", precios pequeños). */
export const mono = "var(--font-plex-mono), 'IBM Plex Mono', ui-monospace, monospace";

// ── Paleta día/noche del diseño nuevo (ModoTokens) ──────────────────────────
// Misma FORMA que `lib/portal-paleta.ts` (para poder pasarla tal cual como
// prop `t` a `ReservaCalendario`, que espera `ModoTokens`), valores propios.
// `micro`/`heroAccent` usan `--ter` (#98A093, el verde-gris de las
// versalitas del diseño) — igual que en portal-paleta.ts, exento de AA (son
// versalitas hiperespaciadas, no texto que aporte información).
export const RESERVAR_PALETA: Record<Modo, ModoTokens> = {
  dia: {
    bg: '#FAF9F5', surface: '#FFFFFF', surface2: '#F1F2EA', line: '#E5E3DA',
    ink: '#1A1A1A', muted: '#5A5A52', muted2: '#5A5A52', micro: '#98A093',
    accentInk: '#FAF9F5', tabbar: 'rgba(250,249,245,.72)', bar: '#F1F2EA',
    hero: 'linear-gradient(175deg,#FAF9F5 0%,#F4F3EC 58%,#ECEAE0 100%)',
    heroLine: '#E5E3DA', heroText: '#1A1A1A', heroSub: '#5A5A52', heroAccent: '#4F5C48',
    velo: 'rgba(255,255,255,.55)', veloFuerte: 'rgba(255,255,255,.7)', veloSuave: 'rgba(255,255,255,.5)',
  },
  // Del propio diseño (props `modo:'oscuro'`, script del .dc.html): el mismo
  // verde girado, no negro puro — mismo criterio que ya usa portal-paleta.ts.
  noche: {
    bg: '#161613', surface: '#201F1B', surface2: '#26251F', line: '#31302A',
    ink: '#F4F1E8', muted: '#B5B0A2', muted2: '#B5B0A2', micro: '#7E8074',
    accentInk: '#161613', tabbar: 'rgba(22,22,19,.72)', bar: '#26251F',
    hero: 'linear-gradient(175deg,#201F1B 0%,#1B1A16 58%,#161613 100%)',
    heroLine: '#31302A', heroText: '#F4F1E8', heroSub: '#B5B0A2', heroAccent: '#A9BBA0',
    velo: 'rgba(244,241,232,.05)', veloFuerte: 'rgba(244,241,232,.09)', veloSuave: 'rgba(244,241,232,.03)',
  },
};

// ── Contenedor responsive ───────────────────────────────────────────────────
// El diseño no usa media queries: un único `container-type: inline-size` en
// la raíz + `clamp(min, Ncqw, max)` en cada medida hace que la misma marca
// sirva de 320px a 1280px+. `cq` es el shorthand para escribir esos clamps
// sin repetir "cqw" en cada sitio.
export const containerRoot: CSSProperties = { containerType: 'inline-size' };
export function cq(min: number, vw: number, max: number): string {
  return `clamp(${min}px, ${vw}cqw, ${max}px)`;
}

// ── Densidad (AparienciaWidget.densidad, Fase 3) ────────────────────────────
// `--reservar-densidad-esc` lo fija `ReservaCalendario` en su raíz (prop
// `densidadEsc`, `escalaDensidad()` de apariencia-widget.ts) — 1 (comoda) o
// 0.75 (compacta). `densidadCss(px)` es el único punto de este fichero que la
// lee: se aplica a un conjunto ACOTADO de medidas (padding de tarjeta,
// separación entre filas del listado) — las MÁS VISIBLES al comparar
// "cómoda" vs "compacta", no un retrofit de cada padding/margin del código
// (esa sí sería la reescritura estructural de miles de líneas que
// docs/widget-reservas-theme-builder-diseno.md §3 ya marcó como fuera de
// alcance de un cambio de tokens). Con la escala en 1 (sin personalizar),
// `calc(Npx * 1)` es exactamente Npx — cero cambio visual para quien no toca
// densidad.
export function densidadCss(px: number): string {
  return `calc(${px}px * var(--reservar-densidad-esc, 1))`;
}

// ── Radios (diseño nuevo: dos radios, no una docena) ────────────────────────
// El diseño solo distingue `--rCard` (20, tarjetas/paneles) y `--rBtn` (999,
// TODO botón es píldora) — se mantienen los nombres de siempre (usados en
// ~70 sitios) pero convergen a esos dos valores en vez de una docena de
// radios pixel-exactos al diseño anterior.
export const radius = {
  hero: 24,      // tarjetas de foto grandes (cita, estudio)
  card: 20,      // tarjeta de clase/servicio/reserva
  cardSmall: 18, // tarjetas de plan compactas
  chipCard: 16,  // mini-tarjetas de tipo de clase
  hour: 14,      // botón de hora (citas)
  spot: 9,       // celda del selector de sitio ("cama") — igual que el diseño
  pillBtnLg: 999,
  pillBtnCta: 999,
  pillBtnMd: 999,
  pillBtnSm: 999,
  pillBtnXs: 999,
  navCircle: 999,
  pill: 999,
} as const;

// ── Sombras (más discretas que el diseño anterior — el nuevo apenas las usa) ─
export const shadow = {
  card: '0 16px 36px -28px rgba(15,15,15,.35)',
  cardHover: '0 10px 26px -16px rgba(15,15,15,.18)',
  sidebarCard: '0 18px 40px -30px rgba(15,15,15,.35)',
  hero: '0 22px 46px -32px rgba(15,15,15,.35)',
  ctaOscuro: '0 18px 34px -18px rgba(15,15,15,.45)',
  ctaOscuroFuerte: '0 20px 40px -24px rgba(15,15,15,.45)',
  headerBtn: '0 14px 28px -16px rgba(15,15,15,.4)',
  planClaro: '0 14px 32px -28px rgba(15,15,15,.35)',
  miniCard: '0 12px 28px -26px rgba(15,15,15,.35)',
} as const;

// ── Tipografía ───────────────────────────────────────────────────────────────
// Versalitas en mono (fecha, franja horaria, "plazas libres"...) — la firma
// tipográfica del diseño nuevo, antes en `sans`.
export function eyebrow(size = 9): CSSProperties {
  return {
    fontFamily: mono, fontSize: size, fontWeight: 500, letterSpacing: '.2em',
    paddingLeft: '.2em', textTransform: 'uppercase',
  };
}
/** Titular: misma familia que el cuerpo (`sans`/`serif`), a peso 800 — el diseño no usa cursiva. */
export function heading(vw: [number, number, number], it = false): CSSProperties {
  return { fontFamily: serif, fontSize: cq(...vw), fontWeight: 800, letterSpacing: '-.02em', fontStyle: it ? 'italic' : 'normal', lineHeight: 1 };
}

export const easeCard = `border-color .4s ease, background .4s ease, transform .5s ${EASE}`;
export const easeBtn = `background .35s ease, transform .45s ${EASE}`;

/**
 * Los tokens de esta pantalla, con la apariencia del estudio (Fase 1 del
 * rediseño, docs/widget-reservas-theme-builder-diseno.md) pisando encima de
 * los valores fijos de siempre — nunca al revés. Sin ningún campo tocado,
 * esto devuelve EXACTAMENTE `RESERVAR_PALETA.dia`/`.noche` + los radios de
 * arriba: cero cambio visual para un estudio que no personalice nada.
 *
 * El acento (`--portal-brand`) se queda fuera a propósito — es blanco-etiqueta
 * por estudio y ya vive como custom property CSS, no como valor JS; los
 * consumidores lo leen directamente (`var(--portal-brand)`), igual que ya
 * hace el resto de esta página.
 */
/**
 * `RESERVAR_PALETA.dia` como bloque `<style>` de servidor — mismo papel que
 * `paletaPortalCssText` (lib/portal-paleta.ts) pero con la paleta nueva de
 * esta pantalla. La usa `ThemeStyle` (components/theme-style.tsx) SOLO en
 * `/reservar/[slug]/layout.tsx`; `/portal/[slug]` y `/portal-preview/[slug]`
 * siguen pidiendo la de siempre — son un contexto de marca distinto.
 */
export function paletaReservarCssText(selector = ':root'): string {
  const vars = varsReservarModo('dia');
  // `--font-ui`/`--portal-heading-font` a Jakarta AQUÍ, no en `<html>`
  // (app/layout.tsx): esas dos vars están definidas GLOBALMENTE ahí, con
  // Instrument Sans/Serif, para el portal privado — un `var(--font-ui,
  // fallback)` nunca ve su fallback si la propiedad ya está heredada de un
  // ancestro. Redefinirla aquí, en el `:root` que solo pinta esta pantalla,
  // es lo que hace que `sans`/`serif` (arriba) resuelvan a Jakarta por
  // defecto — y `apariencia-widget.ts` (`fuente`/`fuenteDisplay`) sigue
  // ganando: su override vive más abajo en el árbol (inline en el propio
  // widget), y ese nivel de especificidad siempre gana a este `:root`.
  const varsFuente = `--font-ui: var(--font-jakarta); --portal-heading-font: var(--font-jakarta);`;
  return `${selector} { ${Object.entries(vars).map(([k, v]) => `${k}: ${v};`).join(' ')} ${varsFuente} }`;
}

/**
 * `RESERVAR_PALETA` como custom properties CSS (`--portal-*`), para el mismo
 * caso que ya resolvía `varsPaletaModo` (lib/portal-paleta.ts) pero con la
 * paleta NUEVA — el widget embebido sobre una web oscura del estudio pone
 * estas variables EN LÍNEA sobre la raíz. Mismo nombre de variables (los
 * consumidores ya las leen así), valores de `RESERVAR_PALETA` en vez de
 * `MODO_TOKENS`.
 */
export function varsReservarModo(modo: Modo): Record<string, string> {
  const t = RESERVAR_PALETA[modo];
  return {
    '--portal-bg': t.bg, '--portal-surface': t.surface, '--portal-surface-2': t.surface2,
    '--portal-line': t.line, '--portal-ink': t.ink,
    '--portal-muted': t.muted, '--portal-muted-2': t.muted2, '--portal-micro': t.micro,
    '--portal-accent': t.heroAccent,
    '--portal-velo': t.velo, '--portal-velo-fuerte': t.veloFuerte, '--portal-velo-suave': t.veloSuave,
  };
}

export function resolverTokensReservar(a: AparienciaWidget, modo: 'dia' | 'noche' = 'dia') {
  const base = RESERVAR_PALETA[modo];
  const colores = coloresDe(a, {
    superficie: base.surface, tinta: base.ink, textoSecundario: base.muted,
    linea: base.line, relleno: base.surface2,
  });
  const radios = radiosDe(a, { tarjeta: radius.card, boton: radius.pill, input: radius.spot });
  return {
    ...colores,
    ...radios,
    fuenteUI: familiaCss(a) ?? sans,
    fuenteDisplay: familiaDisplayCss(a) ?? familiaCss(a) ?? serif,
  };
}

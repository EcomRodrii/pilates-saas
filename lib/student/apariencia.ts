// La apariencia de la app de la alumna que elige cada estudio.
//
// Hasta el 22-sep-2026 la app solo tomaba del estudio el TONO de su color, y
// además apagado (lib/student/tema.ts): fondo, tarjetas, texto, botón,
// tipografía y esquinas eran los del kit para todos. Decisión del fundador ese
// día: que el estudio pueda cambiar colores, tipografía e imágenes, pero de
// forma GUIADA — elige entre estilos y parejas tipográficas hechos aquí, no
// cada color suelto. Una app de marca blanca que el estudio pueda dejar ilegible
// no es de marca blanca, es un riesgo.
//
// Cuatro decisiones, todas con su test:
//   · Lo que no se ha elegido emite EXACTAMENTE lo de antes (`acentoCssText`).
//     Ningún estudio cambia de aspecto por desplegar esto.
//   · Cada estilo trae sus neutros medidos: el texto, el secundario y el de
//     apoyo cumplen AA sobre su fondo y su tarjeta.
//   · El color de marca en modo «fiel» conserva el color tal cual, y solo lo
//     oscurece lo justo para que el texto blanco encima se lea.
//   · Lectura tolerante clave a clave: un valor corrupto en una no arrastra a
//     las demás (mismo criterio que `resolveVariantes`).
//
// Puro, sin BD: lo usan el layout de la app (servidor) y el editor (cliente).

import { hexToHsl, hslToHex, colorLegibleSobre } from '../color-utils.ts';
import { hexARgb } from '../wcag-contrast.ts';
import { ratioContraste } from '../wcag-contrast.ts';
import { acentoCssText, acentoDeEstudio, type AcentoStudent } from './tema.ts';

// ── Estilos ──────────────────────────────────────────────────────────────────

export const ESTILO_IDS = ['crema', 'luz', 'arena', 'rubor', 'piedra', 'bosque', 'niebla', 'carbon'] as const;
export type EstiloId = (typeof ESTILO_IDS)[number];

/** `pill` es la forma de botones, chips y badges: 999 = píldora. */
interface Radios { xs: number; sm: number; card: number; hero: number; sheet: number; pill: number }

export interface Estilo {
  id: EstiloId;
  nombre: string;
  descripcion: string;
  background: string;
  foreground: string;
  card: string;
  muted: string;
  mutedForeground: string;
  subtleForeground: string;
  border: string;
  borderStrong: string;
  /** El botón principal cuando el estudio lo quiere en tinta, no en su color. */
  tinta: string;
  tintaForeground: string;
  radios: Radios;
  /** Fondo oscuro: el color de marca se ACLARA en vez de oscurecerse, y el texto de encima se invierte. */
  oscuro?: boolean;
}

export const ESTILOS: readonly Estilo[] = [
  {
    // Los valores de `student.css`, copiados tal cual: es el aspecto de hoy.
    id: 'crema', nombre: 'Crema', descripcion: 'Cálido y suave. El de siempre.',
    background: '#FAF9F5', foreground: '#1A1A1A', card: '#FFFFFF', muted: '#EFEDE4',
    mutedForeground: '#5A5A52', subtleForeground: '#6C7567', border: '#E5E3DA', borderStrong: '#D9D6C9',
    tinta: '#1A1A1A', tintaForeground: '#F1ECE1',
    radios: { xs: 8, sm: 12, card: 16, hero: 20, sheet: 24, pill: 999 },
  },
  {
    // Al revés que los demás: fondo blanco y tarjetas en gris muy claro.
    id: 'luz', nombre: 'Luz', descripcion: 'Blanco y limpio, esquinas discretas.',
    background: '#FFFFFF', foreground: '#18181B', card: '#F4F4F5', muted: '#EAEAEC',
    mutedForeground: '#52525B', subtleForeground: '#60606A', border: '#E4E4E7', borderStrong: '#D4D4D8',
    tinta: '#18181B', tintaForeground: '#FAFAFA',
    radios: { xs: 6, sm: 10, card: 12, hero: 16, sheet: 20, pill: 12 },
  },
  {
    id: 'arena', nombre: 'Arena', descripcion: 'Tostado y redondeado, muy acogedor.',
    background: '#F4EEE5', foreground: '#2A241F', card: '#FFFCF7', muted: '#EAE1D3',
    mutedForeground: '#5C5244', subtleForeground: '#6A5F50', border: '#E4D9C7', borderStrong: '#D6C8B2',
    tinta: '#2A241F', tintaForeground: '#F7F1E8',
    radios: { xs: 10, sm: 14, card: 20, hero: 26, sheet: 28, pill: 999 },
  },
  {
    id: 'rubor', nombre: 'Rubor', descripcion: 'Rosa empolvado, suave y femenino.',
    background: '#FAF3F1', foreground: '#2B1F1D', card: '#FFFFFF', muted: '#F1E5E1',
    mutedForeground: '#5E4E4A', subtleForeground: '#6F5D58', border: '#EFDFDA', borderStrong: '#E2CDC6',
    tinta: '#2B1F1D', tintaForeground: '#FBF1EE',
    radios: { xs: 10, sm: 14, card: 20, hero: 24, sheet: 28, pill: 999 },
  },
  {
    id: 'piedra', nombre: 'Piedra', descripcion: 'Gris verdoso y recto, editorial.',
    background: '#E6EAE5', foreground: '#1C221E', card: '#F8FAF7', muted: '#DCE1DB',
    mutedForeground: '#4A524D', subtleForeground: '#555D58', border: '#D3DAD2', borderStrong: '#C3CCC2',
    tinta: '#1C221E', tintaForeground: '#F1F4EF',
    radios: { xs: 4, sm: 6, card: 8, hero: 10, sheet: 16, pill: 6 },
  },
  {
    id: 'bosque', nombre: 'Bosque', descripcion: 'Verde sereno, natural y en calma.',
    background: '#EDF1E9', foreground: '#1B2418', card: '#FAFCF7', muted: '#E0E7DB',
    mutedForeground: '#4B5548', subtleForeground: '#566052', border: '#D7E0D1', borderStrong: '#C5D1BE',
    tinta: '#1B2418', tintaForeground: '#F2F6EE',
    radios: { xs: 8, sm: 12, card: 18, hero: 22, sheet: 26, pill: 999 },
  },
  {
    id: 'niebla', nombre: 'Niebla', descripcion: 'Azul frío y sobrio, muy nítido.',
    background: '#EFF2F6', foreground: '#161F2B', card: '#FFFFFF', muted: '#E1E7EF',
    mutedForeground: '#4B5563', subtleForeground: '#576273', border: '#DCE3EC', borderStrong: '#C7D1DE',
    tinta: '#161F2B', tintaForeground: '#F3F6FA',
    radios: { xs: 6, sm: 10, card: 14, hero: 18, sheet: 22, pill: 14 },
  },
  {
    // El único con el fondo oscuro. `oscuro` no es decoración: cambia de qué
    // lado se deriva el acento y qué tinta lleva encima (ver `acentoDe`).
    id: 'carbon', nombre: 'Carbón', descripcion: 'Oscuro y elegante, de noche.',
    background: '#17181B', foreground: '#F2F3F5', card: '#202226', muted: '#292C31',
    mutedForeground: '#AEB3BB', subtleForeground: '#9BA1A9', border: '#2E3138', borderStrong: '#3C4048',
    tinta: '#F2F3F5', tintaForeground: '#17181B',
    radios: { xs: 8, sm: 12, card: 16, hero: 20, sheet: 24, pill: 999 },
    oscuro: true,
  },
];

// ── Tipografías ──────────────────────────────────────────────────────────────

export const TIPOGRAFIA_IDS = ['moderna', 'editorial', 'elegante', 'serena', 'geometrica', 'redonda', 'nitida', 'romantica', 'contraste'] as const;
export type TipografiaId = (typeof TIPOGRAFIA_IDS)[number];

export interface Tipografia {
  id: TipografiaId;
  nombre: string;
  /** Qué se ve en el selector: los nombres de las dos familias. */
  familias: string;
  /** `font-family` de los títulos y del texto. Solo familias que carga `app/layout.tsx`. */
  titulos: string;
  texto: string;
  pesoTitulo: number;
  /** Multiplica los tamaños de título: una serif de trazo fino a 25 px se lee menor que una sans. */
  escalaTitulo: number;
  /** Se suma al tracking de cada título; las serif no aguantan el −0,03 em de la sans. */
  trackingTitulo: string;
}

const SANS = ', system-ui, -apple-system, sans-serif';
const SERIF = ', Georgia, serif';

export const TIPOGRAFIAS: readonly Tipografia[] = [
  { id: 'moderna', nombre: 'Moderna', familias: 'Plus Jakarta Sans',
    titulos: `var(--font-jakarta)${SANS}`, texto: `var(--font-jakarta)${SANS}`, pesoTitulo: 800, escalaTitulo: 1, trackingTitulo: '0em' },
  { id: 'editorial', nombre: 'Editorial', familias: 'Libre Caslon · Figtree',
    titulos: `var(--font-libre-caslon)${SERIF}`, texto: `var(--font-figtree)${SANS}`, pesoTitulo: 700, escalaTitulo: 0.94, trackingTitulo: '.02em' },
  { id: 'elegante', nombre: 'Elegante', familias: 'Cormorant Garamond · Plus Jakarta Sans',
    titulos: `var(--font-cormorant)${SERIF}`, texto: `var(--font-jakarta)${SANS}`, pesoTitulo: 600, escalaTitulo: 1.22, trackingTitulo: '.03em' },
  { id: 'serena', nombre: 'Serena', familias: 'Instrument Serif · Instrument Sans',
    titulos: `var(--font-display)${SERIF}`, texto: `var(--font-ui)${SANS}`, pesoTitulo: 400, escalaTitulo: 1.16, trackingTitulo: '.02em' },
  { id: 'geometrica', nombre: 'Geométrica', familias: 'Outfit',
    titulos: `var(--font-outfit)${SANS}`, texto: `var(--font-outfit)${SANS}`, pesoTitulo: 700, escalaTitulo: 1, trackingTitulo: '.01em' },
  { id: 'redonda', nombre: 'Redonda', familias: 'Poppins',
    titulos: `var(--font-poppins)${SANS}`, texto: `var(--font-poppins)${SANS}`, pesoTitulo: 600, escalaTitulo: 0.94, trackingTitulo: '.02em' },
  { id: 'nitida', nombre: 'Nítida', familias: 'Instrument Sans',
    titulos: `var(--font-ui)${SANS}`, texto: `var(--font-ui)${SANS}`, pesoTitulo: 700, escalaTitulo: 1, trackingTitulo: '.01em' },
  { id: 'romantica', nombre: 'Romántica', familias: 'Cormorant Garamond · Figtree',
    titulos: `var(--font-cormorant)${SERIF}`, texto: `var(--font-figtree)${SANS}`, pesoTitulo: 500, escalaTitulo: 1.26, trackingTitulo: '.04em' },
  { id: 'contraste', nombre: 'Contraste', familias: 'Outfit · Figtree',
    titulos: `var(--font-outfit)${SANS}`, texto: `var(--font-figtree)${SANS}`, pesoTitulo: 700, escalaTitulo: 1.02, trackingTitulo: '0em' },
];

// ── Lo que guarda el estudio ─────────────────────────────────────────────────

/** `suave`: el tono de su marca dentro de la gama apagada del kit (lo de siempre). `fiel`: su color tal cual. */
export type IntensidadMarca = 'suave' | 'fiel';
/** `tinta`: botón principal oscuro, como el kit. `marca`: en el color del estudio. */
export type ColorBoton = 'tinta' | 'marca';
/** Qué parte de la foto de portada se ve. `null` = la de siempre en cada pantalla. */
export type EncuadrePortada = 'arriba' | 'centro' | 'abajo' | null;

export interface AparienciaApp {
  estilo: EstiloId;
  tipografia: TipografiaId;
  marca: IntensidadMarca;
  boton: ColorBoton;
  encuadre: EncuadrePortada;
}

/** El aspecto de hoy. ⚠️ Cambiar un valor aquí cambia la app de todos los estudios que no han elegido nada. */
export const APARIENCIA_POR_DEFECTO: AparienciaApp = {
  estilo: 'crema', tipografia: 'moderna', marca: 'suave', boton: 'tinta', encuadre: null,
};

const ENCUADRES = ['arriba', 'centro', 'abajo'] as const;
const Y_ENCUADRE: Record<Exclude<EncuadrePortada, null>, string> = { arriba: '12%', centro: '45%', abajo: '85%' };

function valorDe<T extends string>(crudo: unknown, validos: readonly T[], porDefecto: T): T {
  return typeof crudo === 'string' && (validos as readonly string[]).includes(crudo) ? (crudo as T) : porDefecto;
}

/** Lo guardado, validado clave a clave. Cualquier cosa que no se reconozca vale lo de siempre. */
export function resolverApariencia(crudo: unknown): AparienciaApp {
  const o = crudo && typeof crudo === 'object' ? (crudo as Record<string, unknown>) : {};
  const d = APARIENCIA_POR_DEFECTO;
  return {
    estilo: valorDe(o.estilo, ESTILOS.map(e => e.id), d.estilo),
    tipografia: valorDe(o.tipografia, TIPOGRAFIAS.map(t => t.id), d.tipografia),
    marca: valorDe(o.marca, ['suave', 'fiel'] as const, d.marca),
    boton: valorDe(o.boton, ['tinta', 'marca'] as const, d.boton),
    encuadre: typeof o.encuadre === 'string' && (ENCUADRES as readonly string[]).includes(o.encuadre)
      ? (o.encuadre as EncuadrePortada) : null,
  };
}

export const estiloPorId = (id: EstiloId): Estilo => ESTILOS.find(e => e.id === id) ?? ESTILOS[0];
export const tipografiaPorId = (id: TipografiaId): Tipografia => TIPOGRAFIAS.find(t => t.id === id) ?? TIPOGRAFIAS[0];

// ── El color de marca «fiel» ────────────────────────────────────────────────

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** El fondo de un estilo, translúcido, para las barras que flotan sobre el contenido. */
function velo(hex: string): string {
  const c = hexARgb(hex);
  return c ? `rgba(${c.r}, ${c.g}, ${c.b}, .88)` : 'rgba(250, 249, 245, .88)';
}

/**
 * El color del estudio tal cual, oscurecido SOLO si hace falta: el acento lleva
 * texto blanco encima (botones, badges) y tiene que leerse sobre el fondo del
 * estilo (enlaces). Un rosa pastel sale rosa intenso, no malva apagado.
 */
export function acentoFiel(colorPrimario: string | null | undefined, fondo: string): AcentoStudent {
  const hsl = colorPrimario ? hexToHsl(colorPrimario) : null;
  if (!hsl) return acentoDeEstudio(colorPrimario);
  let l = hsl.l;
  let accent = hslToHex({ h: hsl.h, s: hsl.s, l });
  while (l > 5 && ((ratioContraste(accent, '#FFFFFF') ?? 0) < 4.5 || (ratioContraste(accent, fondo) ?? 0) < 4.5)) {
    l -= 2;
    accent = hslToHex({ h: hsl.h, s: hsl.s, l });
  }
  const soft = hslToHex({ h: hsl.h, s: clamp(hsl.s * 0.6, 12, 60), l: 93 });
  return {
    accent,
    accentForeground: '#FFFFFF',
    accentSoft: soft,
    accentSoftForeground: colorLegibleSobre(accent, soft),
    accentDeep: hslToHex({ h: hsl.h, s: clamp(hsl.s * 0.9, 20, 70), l: 14 }),
    accentDeepForeground: hslToHex({ h: hsl.h, s: clamp(hsl.s * 0.4, 8, 40), l: 94 }),
    accentDeepMuted: hslToHex({ h: hsl.h, s: clamp(hsl.s * 0.6, 12, 55), l: 76 }),
  };
}

/**
 * El acento sobre un fondo OSCURO: se deriva hacia el otro lado.
 *
 * ⚠️ En claro, el acento se oscurece hasta que el blanco de encima se lee. Con
 * «Carbón» eso daría un acento oscuro sobre fondo oscuro: un enlace que no se
 * ve. Aquí se ACLARA hasta separarse del fondo, y la tinta de encima pasa a ser
 * oscura — por eso `accentForeground` no puede ser blanco fijo.
 *
 * `suave` aquí no significa «más apagado» sino la misma gama contenida del kit
 * (S 16-38); `fiel` conserva la saturación del estudio.
 */
function acentoClaroSobreOscuro(colorPrimario: string | null | undefined, e: Estilo, marca: IntensidadMarca): AcentoStudent {
  // Sin color propio, el verde contenido del kit: el mismo punto de partida
  // que `ACENTO_POR_DEFECTO` en tema.ts, ya aclarado por el bucle de abajo.
  const hsl = (colorPrimario ? hexToHsl(colorPrimario) : null) ?? { h: 95, s: 22, l: 40 };
  const s = marca === 'fiel' ? clamp(hsl.s, 20, 75) : clamp(hsl.s, 16, 38);
  let l = Math.max(hsl.l, 62);
  let accent = hslToHex({ h: hsl.h, s, l });
  while (l < 92 && (ratioContraste(accent, e.background) ?? 0) < 4.5) accent = hslToHex({ h: hsl.h, s, l: (l += 2) });
  const soft = hslToHex({ h: hsl.h, s: clamp(s * 0.5, 8, 40), l: 22 });
  return {
    accent,
    // Encima del acento va el fondo del estilo, no blanco: el acento es claro.
    accentForeground: colorLegibleSobre(e.background, accent),
    accentSoft: soft,
    accentSoftForeground: colorLegibleSobre(accent, soft),
    // La tarjeta de «tu próxima clase» y el pase: un tono profundo del color.
    accentDeep: hslToHex({ h: hsl.h, s: clamp(s * 0.8, 14, 60), l: 26 }),
    accentDeepForeground: hslToHex({ h: hsl.h, s: clamp(s * 0.3, 6, 30), l: 94 }),
    accentDeepMuted: hslToHex({ h: hsl.h, s: clamp(s * 0.5, 10, 45), l: 72 }),
  };
}

/** El acento que se verá, sea cual sea la intensidad. Lo usa también el editor para pintar muestras. */
export function acentoDe(colorPrimario: string | null | undefined, a: AparienciaApp): AcentoStudent {
  const e = estiloPorId(a.estilo);
  if (e.oscuro) return acentoClaroSobreOscuro(colorPrimario, e, a.marca);
  return a.marca === 'fiel' ? acentoFiel(colorPrimario, e.background) : acentoDeEstudio(colorPrimario);
}

// ── El CSS ───────────────────────────────────────────────────────────────────

/**
 * El `<style>` de la app para este estudio. Sin nada elegido, idéntico a
 * `acentoCssText`: solo añade lo que el estudio ha cambiado respecto al kit.
 *
 * `selector` existe para la vista previa del editor, que pisa lo publicado con
 * `.student-app.student-app` (más específico) sin tocar el `<style>` del layout.
 */
export function temaAppCssText(colorPrimario: string | null | undefined, crudo: unknown, selector = '.student-app'): string {
  const a = resolverApariencia(crudo);
  if (a.marca === 'suave' && a.estilo === 'crema' && a.tipografia === 'moderna' && a.boton === 'tinta' && !a.encuadre) {
    return selector === '.student-app' ? acentoCssText(colorPrimario) : acentoCssText(colorPrimario).replace('.student-app{', `${selector}{`);
  }
  const acento = acentoDe(colorPrimario, a);
  const decl: string[] = [
    `--accent:${acento.accent}`,
    `--accent-foreground:${acento.accentForeground}`,
    `--accent-soft:${acento.accentSoft}`,
    `--accent-soft-foreground:${acento.accentSoftForeground}`,
    `--accent-deep:${acento.accentDeep}`,
    `--accent-deep-foreground:${acento.accentDeepForeground}`,
    `--accent-deep-muted:${acento.accentDeepMuted}`,
  ];
  const e = estiloPorId(a.estilo);
  if (e.id !== 'crema') {
    decl.push(
      // El velo de las barras que flotan sobre el contenido: el fondo del
      // estilo, translúcido. Sin esto la barra de abajo se queda crema sobre
      // un fondo oscuro (medido en la app, 23-sep).
      `--velo:${velo(e.background)}`,
      `--background:${e.background}`, `--foreground:${e.foreground}`, `--card:${e.card}`, `--muted:${e.muted}`,
      `--muted-foreground:${e.mutedForeground}`, `--subtle-foreground:${e.subtleForeground}`,
      `--border:${e.border}`, `--border-strong:${e.borderStrong}`,
      `--radius-xs:${e.radios.xs}px`, `--radius-sm:${e.radios.sm}px`, `--radius-card:${e.radios.card}px`,
      `--radius-hero:${e.radios.hero}px`, `--radius-sheet:${e.radios.sheet}px`, `--radius-pill:${e.radios.pill}px`,
    );
  }
  if (a.boton === 'marca') {
    decl.push(`--primary:${acento.accent}`, `--primary-foreground:${acento.accentForeground}`);
  } else if (e.id !== 'crema') {
    decl.push(`--primary:${e.tinta}`, `--primary-foreground:${e.tintaForeground}`);
  }
  const t = tipografiaPorId(a.tipografia);
  if (t.id !== 'moderna') {
    decl.push(
      `--font-sans:${t.texto}`, `--font-heading:${t.titulos}`, `--heading-weight:${t.pesoTitulo}`,
      `--heading-scale:${t.escalaTitulo}`, `--heading-tracking:${t.trackingTitulo}`,
    );
  }
  if (a.encuadre) decl.push(`--portada-y:${Y_ENCUADRE[a.encuadre]}`);
  // ⚠️ El `body` es de la hoja del PANEL, no de la app, así que se queda con su
  // crema: al rebotar el scroll en el móvil (y en el hueco bajo la barra del
  // navegador) asomaba una franja blanca debajo de una app oscura. Y
  // `color-scheme` es lo que tiñe lo que pinta el navegador y no el CSS: la
  // barra de desplazamiento y ese mismo rebote.
  const fondoPagina = e.id === 'crema' ? '' :
    `body{background:${e.background};}` + (e.oscuro ? `:root{color-scheme:dark;}` : '');
  return `${selector}{${decl.join(';')};}` + fondoPagina;
}

/** El color de fondo que ve la alumna: la barra del navegador y el manifest de la PWA lo usan. */
export function fondoDeApariencia(crudo: unknown): string {
  return estiloPorId(resolverApariencia(crudo).estilo).background;
}

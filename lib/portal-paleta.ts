// La paleta día/noche del portal de la clienta, sin React.
//
// Vive separada de `lib/portal-modo.tsx` por el mismo motivo que
// `permisos-reglas.ts` vive separado de `permisos.ts`: aquel es `'use client'`
// y arrastra hooks, así que no se podía comprobar sin levantar medio entorno —
// y una regla de contraste que nadie comprueba es justo la que se rompe. Aquí
// son datos puros; `portal-modo.tsx` los reexporta, así que ningún import de
// fuera cambia.

export type Modo = 'dia' | 'noche';

export interface ModoTokens {
  bg: string; surface: string; surface2: string; line: string;
  ink: string; muted: string; muted2: string;
  /** Versalitas decorativas. Exento de AA a propósito — ver la nota de abajo. */
  micro: string;
  accentInk: string; tabbar: string; bar: string;
  hero: string; heroLine: string; heroText: string; heroSub: string; heroAccent: string;
  /**
   * «Velos»: paneles y tarjetas translúcidos que se apoyan sobre el fondo del
   * hero. Tres intensidades, de más tenue a más sólida.
   *
   * ⚠️ Existen porque estaban escritos a mano como `rgba(255,255,255,.55)` en
   * doce sitios, y al aclarar el texto del widget incrustado (#979) esos
   * paneles se quedaban BLANCOS con letra clara encima — ilegibles sobre una
   * web oscura. El color de un panel depende del modo, así que su sitio es la
   * paleta y no el JSX.
   *
   * En DÍA valen exactamente lo que valían, para no cambiarle el aspecto a
   * nadie. En NOCHE son un realce tenue del propio color de tinta sobre el
   * fondo oscuro: un blanco al 55 % ahí sería un foco.
   */
  velo: string; veloFuerte: string; veloSuave: string;
}

// ── Contraste ────────────────────────────────────────────────────────────────
//
// Los grises del diseño no llegaban a WCAG AA: #7C7F72 daba 3,72:1 y #9B9689,
// 2,68:1. No es purismo — son los grises que llevan el nombre de la
// instructora, la sala y el día de la clase.
//
// Decisión tomada explícitamente: el texto que aporta INFORMACIÓN se oscurece
// lo mínimo para pasar 4,5:1 (#7C7F72 → #6E7065, −5,5 de luminosidad; #8B8779 →
// #736F63, −9; #6B7A64 → #66745F, −2). A ese tamaño no se ve la diferencia, y
// `portal-paleta.test.ts` lo deja fijado.
//
// `micro` conserva el gris EXACTO del diseño (#9B9689) y queda exento: son
// versalitas hiperespaciadas cuyo trabajo es susurrar, y pasarlas a AA exigía
// −15,5 de luminosidad, que aplana tres niveles de gris en dos. Es deuda de
// accesibilidad asumida a conciencia, no un descuido.
//
// ⚠️ NINGÚN texto de estos va sobre `surface2`: ahí los tres caen a ~3,9:1. En
// el diseño `surface2` solo es el color de espera de una foto y el carril de la
// barra de progreso — nunca fondo de texto. Que siga siendo así.
export const MODO_TOKENS: Record<Modo, ModoTokens> = {
  dia: {
    bg: '#F6F4EF', surface: '#FFFFFF', surface2: '#E7E4DB', line: 'rgba(34,38,31,0.10)',
    ink: '#22261F', muted: '#6E7065', muted2: '#736F63', micro: '#9B9689',
    accentInk: '#F6F4EF', tabbar: 'rgba(246,244,239,0.72)', bar: '#E7E4DB',
    hero: 'linear-gradient(175deg,#F2F0EA 0%,#ECE9E2 58%,#E4E1D8 100%)',
    heroLine: 'rgba(34,38,31,0.10)', heroText: '#22261F', heroSub: '#6E7065', heroAccent: '#66745F',
    velo: 'rgba(255,255,255,.55)', veloFuerte: 'rgba(255,255,255,.7)', veloSuave: 'rgba(255,255,255,.5)',
  },
  // Derivada: el mismo verde, girado. El fondo no es negro sino oliva muy
  // oscuro, y la tinta no es blanca sino el propio crema del diseño — blanco
  // puro sobre casi-negro es lo que hace que una app nocturna parezca un
  // terminal en vez de un estudio.
  noche: {
    bg: '#12140E', surface: '#1C1F17', surface2: '#242820', line: 'rgba(243,241,233,0.09)',
    ink: '#F3F1E9', muted: '#A8AA9C', muted2: '#9A9C8E', micro: '#7E8074',
    accentInk: '#12140E', tabbar: 'rgba(18,20,14,0.72)', bar: '#2A2E24',
    hero: 'linear-gradient(175deg,#1F2419 0%,#181C13 58%,#12140E 100%)',
    heroLine: 'rgba(243,241,233,0.09)', heroText: '#F3F1E9', heroSub: '#A8AA9C', heroAccent: '#A9BBA0',
    velo: 'rgba(243,241,233,.05)', veloFuerte: 'rgba(243,241,233,.09)', veloSuave: 'rgba(243,241,233,.03)',
  },
};

/** Fondos sobre los que SÍ se pinta texto. `surface2` queda fuera a propósito. */
export const FONDOS_CON_TEXTO = ['bg', 'surface'] as const;

/** Tokens de texto que llevan información y por tanto deben pasar AA. */
export const TEXTO_CON_INFORMACION = ['ink', 'muted', 'muted2', 'heroAccent'] as const;

/**
 * La paleta como variables CSS, generada DESDE los tokens de arriba.
 *
 * Existe porque las páginas públicas (`/reservar`) pintan con utilidades de
 * Tailwind —`text-[…]`, `bg-[…]`— y desde ahí no se puede leer un objeto de
 * TypeScript. Copiar los valores a `globals.css` era la alternativa, y este
 * repo ya arrastra cuatro fuentes de verdad para el color: no hacía falta una
 * quinta. Se emite en servidor (components/theme-style.tsx), así que llega en
 * el HTML inicial y no hay parpadeo.
 *
 * Solo el modo DÍA: `/reservar` es previo al login y no tiene interruptor.
 */
export function paletaPortalCssText(selector = ':root'): string {
  const vars = varsPaletaModo('dia');
  return `${selector} { ${Object.entries(vars).map(([k, v]) => `${k}: ${v};`).join(' ')} }`;
}

/**
 * La paleta de un modo como objeto de custom properties.
 *
 * Existe para que el widget incrustado pueda pedir la paleta de NOCHE sin
 * duplicar los valores: cuando el estudio lo pone sobre una web oscura, el
 * texto tiene que aclararse, y aclararlo a mano habría añadido una sexta fuente
 * de verdad para el color a un repo que ya arrastraba cuatro.
 *
 * ⚠️ Se aplica EN LÍNEA sobre la raíz del widget, no desde `ThemeStyle`: un
 * layout de Next no recibe `searchParams`, así que el servidor no puede saber
 * qué pidió el iframe. Las custom properties en un `style` cascadean igual a
 * todo el subárbol.
 */
export function varsPaletaModo(modo: Modo): Record<string, string> {
  const t = MODO_TOKENS[modo];
  return {
    '--portal-bg': t.bg, '--portal-surface': t.surface, '--portal-surface-2': t.surface2,
    '--portal-line': t.line, '--portal-ink': t.ink,
    '--portal-muted': t.muted, '--portal-muted-2': t.muted2, '--portal-micro': t.micro,
    '--portal-accent': t.heroAccent,
    '--portal-velo': t.velo, '--portal-velo-fuerte': t.veloFuerte, '--portal-velo-suave': t.veloSuave,
  };
}

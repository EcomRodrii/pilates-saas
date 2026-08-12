/** Contrato del tema. Los cuatro temas rellenan esta misma forma. */

export type WelcomeStyle = "photo" | "soft" | "dark";
export type GreetingStyle = "display-first" | "micro-first";
export type QuickLinksStyle = "cards" | "bare";
export type TabBarStyle = "classic" | "floating";
export type DetailStyle = "card" | "bleed";

/**
 * Forma de la tarjeta de "próxima clase".
 *   `hero`   — la tarjeta con foto y velo de Oliva/Bloom/Noir.
 *   `ticket` — el billete blanco troquelado de Tentada: dos mitades separadas
 *              por una línea de puntos y dos muescas del color del lienzo.
 */
export type NextClassStyle = "hero" | "ticket";

export type HomeBlockName =
  | "greeting"
  | "home-header"
  | "headline"
  | "next-class"
  | "today-timeline"
  | "pass-card"
  | "bookings-list"
  | "challenges"
  | "weekly-progress"
  | "quick-links"
  | "week-strip"
  | "studio-banner";

export interface ThemeFeatures {
  welcome_style: WelcomeStyle;
  welcome_curves: boolean;
  welcome_seal: boolean;
  welcome_cta_circle: boolean;
  greeting_style: GreetingStyle;
  hero_badge: boolean;
  quick_links_style: QuickLinksStyle;
  tab_bar_style: TabBarStyle;
  tab_icon_fill: boolean;
  detail_style: DetailStyle;
  next_class_style: NextClassStyle;
}

export interface PaletteEntry {
  name: string;
  value: string;
  role: string;
  /** Contraste medido contra el fondo del tema. 0 = no aplica. */
  ratio: number;
}

export interface TypeEntry {
  token: string;
  family: "display" | "body";
  size: number;
  leading: number;
  weight: number;
  tracking?: string;
  sample: string;
}

export interface ThemeConfig {
  id: "tentada" | "oliva" | "bloom" | "noir";
  name: string;
  version: string;
  studio: string;
  tagline: string;
  features: ThemeFeatures;
  /** Orden de los bloques del Inicio. Cambiarlo reordena la pantalla. */
  home_blocks: HomeBlockName[];
  member_name: string;
  member_initial: string;
  headline?: string;
  /**
   * Segunda línea de la cabecera del Inicio, bajo el saludo. Es COPY del tema
   * (Tentada la escribe en cursiva bajo «Hola, Laura»), no un dato del
   * estudio: sin ella el bloque simplemente no la pinta.
   */
  greeting_note?: string;
  welcome: { line1: string; line2: string; text: string; cta: string };
  fonts: { families: string[]; display: string; body: string };
  designSystem: {
    palette: PaletteEntry[];
    type: TypeEntry[];
    spacing: number[];
    radii: { name: string; value: number }[];
    shadows: { name: string; value: string }[];
    colorNote: string;
  };
}

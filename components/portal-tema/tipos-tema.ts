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

/**
 * Forma del resumen de la semana.
 *   `card` — dentro de una tarjeta, con «Ver agenda» (Oliva/Bloom/Noir).
 *   `bare` — la fila de siete días a pelo sobre el lienzo, con el mes en
 *            cursiva a la derecha (Tentada).
 */
export type WeekStripStyle = "card" | "bare";

/**
 * Qué pestañas lleva la barra.
 *   `basico`  — Inicio · Clases · Reservas · Perfil (Oliva/Bloom/Noir).
 *   `centro`  — Inicio · Reservas · Mi centro · Bonos · Perfil (Tentada).
 */
export type TabSet = "basico" | "centro";

/**
 * Forma de la pantalla de horario.
 *   `chips` — «Clases», contador y filtros por tipo (Oliva/Bloom/Noir).
 *   `tabs`  — «Reservas» con dos pestañas, Clases y Lista de espera (Tentada).
 */
export type ScheduleStyle = "chips" | "tabs";

/**
 * Forma de la pantalla de bonos.
 *   `plan`     — el bono activo arriba y los planes debajo (Oliva/Bloom/Noir).
 *   `cartera`  — «Mis bonos» con dos pestañas, Bonos e Historial (Tentada).
 */
export type PassesStyle = "plan" | "cartera";

/**
 * Forma de «Mi perfil».
 *   `card`   — la maqueta del kit (Oliva/Bloom/Noir).
 *   `header` — cabecera verde y filas, con «Aspecto» y el estado SEPA
 *              conservados del perfil de siempre (Tentada).
 */
export type ProfileStyle = "card" | "header";

export type HomeBlockName =
  | "greeting"
  | "home-header"
  | "headline"
  | "next-class"
  | "today-timeline"
  | "pass-card"
  | "bookings-list"
  | "streak-pill"
  | "videos-cta"
  | "studio-quote"
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
  week_strip_style: WeekStripStyle;
  tab_set: TabSet;
  schedule_style: ScheduleStyle;
  passes_style: PassesStyle;
  profile_style: ProfileStyle;
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
  /**
   * La cita con la que el Inicio cierra. Es COPY del tema, no del estudio: el
   * bloque la firma con el nombre real y el año de apertura, que sí son datos.
   * Sin ella el bloque no se pinta.
   */
  closing_quote?: string;
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

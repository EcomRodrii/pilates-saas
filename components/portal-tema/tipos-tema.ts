/** Contrato del tema. Los cinco temas rellenan esta misma forma. */

export type WelcomeStyle = "photo" | "soft" | "dark";
/**
 * Jerarquía de la cabecera del Inicio.
 *
 *   `display-first` — «Hola, Laura» grande arriba y la pregunta debajo (Oliva).
 *   `micro-first`   — un micro («Buenos días») y el nombre debajo.
 *   `date-first`    — la FECHA de hoy en micro y «Hola, Laura» en la serif
 *                     grande debajo, sin avatar (Sereno). La campana se queda
 *                     a la derecha, con su punto.
 */
export type GreetingStyle = "display-first" | "micro-first" | "date-first";
export type QuickLinksStyle = "cards" | "bare";
export type TabBarStyle = "classic" | "floating";
/**
 * Cabecera del detalle de clase.
 *   `card`       — foto contenida y el título dentro de la hoja.
 *   `bleed`      — foto a sangre con el título y la instructora ENCIMA.
 *   `bleed-bajo` — foto a sangre pero el título DEBAJO, sobre el lienzo, con
 *                  el estado como píldora sobre la foto (Sereno). El texto
 *                  deja de depender del brillo de la imagen.
 */
export type DetailStyle = "card" | "bleed" | "bleed-bajo";

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
/**
 * Qué cuatro (o cinco) pestañas lleva la barra.
 *
 *   `basico`  — Inicio · Clases · Reservas · Perfil.
 *   `centro`  — los cinco de Tentada, con «Mi centro» y «Bonos».
 *   `agenda`  — como `basico`, pero la tercera se llama «Agenda» y su icono es
 *               un reloj. Es la de Sereno: su prototipo titula esa pantalla
 *               «Mi agenda», no «Mis reservas».
 *
 * ⚠️ Es un `tab_set` nuevo y no un renombrado del de siempre a propósito. El
 * README del paquete pedía hacerlo «vía la config de nav existente
 * (`lib/portal-nav.ts`), sin tocar el kit», y esa vía NO llega hasta aquí:
 * `NAV_SEG_IDS` es del portal viejo (`home`/`clases`/`bonos`/`videos`/`perfil`),
 * no tiene ningún segmento `reservas`, y el kit no lee `navPortal` en ningún
 * sitio — comprobado con grep. Cambiar la etiqueta de `basico` habría
 * renombrado la pestaña también a Oliva, Bloom y Noir, que no lo han pedido.
 */
export type TabSet = "basico" | "centro" | "agenda";

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
  | "studio-banner"
  | "waitlist-banner";

export interface ThemeFeatures {
  welcome_style: WelcomeStyle;
  welcome_curves: boolean;
  welcome_seal: boolean;
  welcome_cta_circle: boolean;
  greeting_style: GreetingStyle;
  hero_badge: boolean;
  /**
   * El «cuándo» de la próxima clase va como CHIP sobre la foto, y la
   * instructora en una fila con su inicial (Sereno). Solo tiene sentido donde
   * la foto es una banda con sitio libre; con la foto a la derecha
   * (Oliva/Bloom/Noir) el chip caería encima del texto.
   */
  hero_chip?: boolean;
  /**
   * Forma de la tira de días del horario y la agenda.
   *
   *   ausente / `circulos` — el número en un círculo, con la etiqueta encima
   *                          y el punto debajo (Oliva/Bloom/Noir).
   *   `cajas`              — cada día en su tarjeta con borde, etiqueta y
   *                          número apilados (Sereno).
   *
   * Tentada ya pinta cajas en su pantalla de Reservas, pero por una prop del
   * componente, no por el tema: son dos usos distintos de la misma forma.
   */
  day_strip_style?: "circulos" | "cajas";
  quick_links_style: QuickLinksStyle;
  tab_bar_style: TabBarStyle;
  tab_icon_fill: boolean;
  /**
   * Qué pestañas de la barra FLOTANTE llevan etiqueta.
   *
   *   `activa` — solo la activa (Bloom, y el comportamiento de siempre).
   *   `todas`  — las cuatro, siempre (Sereno).
   *
   * Opcional a propósito: ausente = `activa`, así los cuatro temas anteriores
   * no declaran nada y no cambian. En la barra clásica no aplica — ahí todas
   * las pestañas llevan etiqueta desde siempre.
   */
  tab_labels?: "activa" | "todas";
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
  id: "tentada" | "oliva" | "bloom" | "noir" | "sereno";
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

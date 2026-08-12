// ═══════════════════════════════════════════════════════════════════════════
// Esquema del tema white-label por estudio (Fase 1 · backbone)
// ═══════════════════════════════════════════════════════════════════════════
//
// Fuente de verdad de la FORMA de un tema: colores, tipografía (set curado, no
// libre), radio de componentes y favicon. El logo vive aparte en
// `studios.logo_url` (ya existente). Se valida con zod tanto en cliente (feedback
// en vivo) como en servidor (gate al publicar — no confiar en el input).
//
// `resolveTheme()` es el fallback robusto: ante un JSON parcial/corrupto de la DB
// rellena cada token ausente o inválido con el default del sistema, sin romper
// la UI (requisito 3 del brief).

import { z } from 'zod';
import { NAV_SEG_IDS, NAV_ICONOS_DISPONIBLES, DEFAULT_NAV_CONFIG } from './portal-nav.ts';
import { VARIANTES_PORTAL, type EjeVariante } from './theme-variantes.ts';

/** Hex de 3 o 6 dígitos. */
export const hexSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Color hex inválido (ej: #4F46E5)');

/**
 * Set CURADO de tipografías. `jakarta` es la del sistema (ya cargada por
 * `next/font` en el root layout). Las demás se registran con `next/font` en la
 * Fase 3; el `stack` incluye fallback de sistema para degradar con gracia si la
 * fuente aún no está cargada.
 */
export const FUENTES = [
  { id: 'jakarta', label: 'Plus Jakarta Sans', stack: 'var(--font-jakarta), system-ui, sans-serif' },
  { id: 'inter', label: 'Inter', stack: 'var(--font-inter), system-ui, sans-serif' },
  { id: 'poppins', label: 'Poppins', stack: 'var(--font-poppins), system-ui, sans-serif' },
  { id: 'serif', label: 'Serif clásica', stack: 'Georgia, "Times New Roman", serif' },
  { id: 'mono', label: 'Monoespaciada', stack: 'var(--font-plex-mono), ui-monospace, monospace' },
] as const;

export type FontId = (typeof FUENTES)[number]['id'];

/** Estilo de esquinas de los componentes → valor de `--radius`. */
export const RADIOS = [
  { id: 'sharp', label: 'Recto', value: '0.25rem' },
  { id: 'rounded', label: 'Redondeado', value: '1rem' },
  { id: 'pill', label: 'Píldora', value: '2rem' },
] as const;

export type RadiusId = (typeof RADIOS)[number]['id'];

/**
 * Estilo del botón principal (CTA de marca). `solid` es el look de siempre
 * (fondo de marca sólido) — los estudios que ya tienen tema no ven ningún
 * cambio hasta que eligen uno distinto.
 */
export const ESTILOS_BOTON = [
  { id: 'solid', label: 'Sólido' },
  { id: 'outline', label: 'Contorno' },
  { id: 'soft', label: 'Suave' },
] as const;

export type ButtonStyleId = (typeof ESTILOS_BOTON)[number]['id'];

/** Estilo de las tarjetas. `flat` es el look de siempre (borde fino, sin sombra). */
export const ESTILOS_TARJETA = [
  { id: 'flat', label: 'Plana' },
  { id: 'elevated', label: 'Elevada' },
  { id: 'bordered', label: 'Con borde' },
] as const;

export type CardStyleId = (typeof ESTILOS_TARJETA)[number]['id'];

/**
 * Tipografía de TITULARES del portal cliente (`display()` en
 * `lib/portal-design.ts`) — distinta de `fontId`/`FUENTES` de arriba, que solo
 * gobierna el cuerpo/dashboard. `instrumentSerif` es el look de siempre.
 */
export const ESTILOS_TITULAR_PORTAL = [
  { id: 'instrumentSerif', label: 'Instrument Serif (el de siempre)' },
  { id: 'outfit', label: 'Outfit' },
  // Reusa la sans ya cargada (--font-ui, Instrument Sans) en negrita — sin
  // fuente nueva. Ver tema "Editorial" en theme-definitions.ts.
  { id: 'instrumentSansBold', label: 'Instrument Sans (negrita)' },
  // Tema "Bloom" — Poppins ya está en el set curado de FUENTES (cuerpo) y
  // registrada en next/font (app/layout.tsx); aquí se reusa en negrita para
  // titulares, sin fuente nueva.
  { id: 'poppins', label: 'Poppins (negrita)' },
] as const;

export type PortalHeadingFontId = (typeof ESTILOS_TITULAR_PORTAL)[number]['id'];

/**
 * Comportamiento de la barra inferior del portal cliente
 * (`components/portal/portal-shell.tsx`). `clasica` es el look de siempre
 * (sin iconos, todas las pestañas muestran su nombre, pastilla deslizante) —
 * decisión de diseño deliberada y documentada en ese archivo, que NO cambia
 * para nadie que no elija el tema que activa `pestanaActiva`.
 */
export const ESTILOS_TAB_BAR = [
  { id: 'clasica', label: 'Clásica (el de siempre)' },
  { id: 'pestanaActiva', label: 'Pestaña activa' },
] as const;

export type TabBarStyleId = (typeof ESTILOS_TAB_BAR)[number]['id'];

/**
 * Redes sociales del pie de página público (Fase 3 del Theme Builder) — ver
 * app/reservar/[slug]/page.tsx. Set curado (no un enlace libre "otro"): cada
 * campo se guarda TAL CUAL lo escribe el estudio, sin validar como URL
 * estricta aquí — mismo criterio que los `href` de banner/CTA en
 * layout-schema.ts. El filtro real de enlaces peligrosos vive en el RENDER
 * (resolverHrefBloque, lib/portal-home-bloques.ts), no en el guardado.
 */
export const REDES_SOCIALES_IDS = ['instagram', 'facebook', 'whatsapp'] as const;
export type RedSocialId = (typeof REDES_SOCIALES_IDS)[number];

const redesSocialesSchema = z
  .object({ instagram: z.string(), facebook: z.string(), whatsapp: z.string() })
  .strict()
  .default({ instagram: '', facebook: '', whatsapp: '' });

const navSegIdSchema = z.enum(NAV_SEG_IDS);
const navIconoSchema = z.enum(NAV_ICONOS_DISPONIBLES);

/**
 * Navegación inferior del portal cliente (Fase 2 del Theme Builder) — ocultar
 * pestañas y sustituir etiqueta/icono, ver lib/portal-nav.ts. Objeto de
 * claves fijas (una por `NavSegId`), mismo criterio que `bloquesPorPantallaSchema`
 * en layout-schema.ts: un catálogo cerrado y conocido, no un `z.record` abierto.
 */
const navConfigSchema = z
  .object({
    ocultos: z.array(navSegIdSchema),
    etiquetas: z.object({
      home: z.string().optional(),
      clases: z.string().optional(),
      bonos: z.string().optional(),
      videos: z.string().optional(),
      perfil: z.string().optional(),
    }),
    iconos: z.object({
      home: navIconoSchema.optional(),
      clases: navIconoSchema.optional(),
      bonos: navIconoSchema.optional(),
      videos: navIconoSchema.optional(),
      perfil: navIconoSchema.optional(),
    }),
  })
  .default(DEFAULT_NAV_CONFIG);

const fontIdSchema = z.enum(FUENTES.map((f) => f.id) as [FontId, ...FontId[]]);
const radiusSchema = z.enum(RADIOS.map((r) => r.id) as [RadiusId, ...RadiusId[]]);
const faviconSchema = z.string().url().nullable();

/**
 * Lo que se ve al compartir el enlace del estudio (WhatsApp, Instagram) y en
 * el resultado de Google.
 *
 * Hasta ahora el título y la descripción de `/reservar/{slug}` se fabricaban
 * a partir del nombre y la ciudad, SIN ninguna forma de tocarlos, y no había
 * imagen de Open Graph en absoluto: pegar el enlace en un grupo de WhatsApp
 * daba un recuadro de texto gris. Es lo primero que ve una posible clienta y
 * era lo único de toda la marca que la propietaria no podía decidir.
 *
 * ⚠️ **Cadena vacía = «genérate el mío»**, no «déjalo en blanco». Un título
 * vacío de verdad sería peor que el automático de hoy, así que el vacío es la
 * señal de herencia — mismo criterio de "ausente hereda" que ya usan
 * `EstiloBloque` y los overrides por tipo de clase.
 *
 * Los límites (60/160) son los que recortan Google y las tarjetas sociales.
 * Se validan aquí y se avisan en el editor ANTES de publicar, en vez de
 * dejar que el estudio descubra el corte en el móvil de una clienta.
 */
// Textos de la PORTADA de /reservar — el widget que el estudio incrusta en su
// propia web.
//
// ⚠️ Nacen porque hoy son constantes en el código: «Encuentra tu próxima
// clase» se escribió una vez y se sirve IGUAL a todos los estudios. En una
// página que cada uno pega en su web, eso es la marca de otro en su casa.
// Vacío = se usa el texto por defecto, así que nadie cambia salvo que quiera.
export const RESERVAR_TITULAR_MAX = 70;
export const RESERVAR_SUBTITULO_MAX = 160;
export const RESERVAR_CTA_MAX = 28;

// «Sobre nosotros» — la única SECCIÓN de la página de reservas cuyo contenido
// entero lo escribe el estudio. Las demás pintan datos (clases, cifras,
// teléfono); esta no existe hasta que hay algo que contar.
//
// ⚠️ Vacío = la sección NO se pinta, y no hay texto por defecto ninguno. Es a
// propósito y es lo contrario del titular de la portada, donde vacío sí cae en
// un texto de fábrica: un titular genérico se lee como una página sin
// personalizar, pero un «Sobre nosotros» genérico se lee como una MENTIRA
// sobre el estudio. Mismo criterio que la bio de instructora (#946): sin bio no
// se muestra nada, sin marcador de posición inventado.
export const RESERVAR_SOBRE_TITULO_MAX = 60;
export const RESERVAR_SOBRE_TEXTO_MAX = 600;

export const SEO_TITULO_MAX = 60;
export const SEO_DESCRIPCION_MAX = 160;
const seoTituloSchema = z.string().max(SEO_TITULO_MAX);
const seoDescripcionSchema = z.string().max(SEO_DESCRIPCION_MAX);
const seoImagenSchema = z.string().url().nullable();
const reservarTitularSchema = z.string().max(RESERVAR_TITULAR_MAX);
const reservarSubtituloSchema = z.string().max(RESERVAR_SUBTITULO_MAX);
const reservarCtaSchema = z.string().max(RESERVAR_CTA_MAX);
const reservarSobreTituloSchema = z.string().max(RESERVAR_SOBRE_TITULO_MAX);
const reservarSobreTextoSchema = z.string().max(RESERVAR_SOBRE_TEXTO_MAX);
// Apariencia del widget INCRUSTADO. Ver lib/reservar/apariencia-widget.ts: son
// ajustes de otra superficie (la web del estudio), no del portal de la socia.
const widgetFondoSchema = z.union([z.literal('transparente'), z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/)]).nullable();
const widgetFuenteSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9 ]{0,39}$/).nullable();
const widgetTextoSchema = z.enum(['auto', 'claro', 'oscuro']);
const buttonStyleSchema = z.enum(ESTILOS_BOTON.map((b) => b.id) as [ButtonStyleId, ...ButtonStyleId[]]);
const cardStyleSchema = z.enum(ESTILOS_TARJETA.map((c) => c.id) as [CardStyleId, ...CardStyleId[]]);
const portalHeadingFontSchema = z.enum(ESTILOS_TITULAR_PORTAL.map((f) => f.id) as [PortalHeadingFontId, ...PortalHeadingFontId[]]);
const tabBarStyleSchema = z.enum(ESTILOS_TAB_BAR.map((t) => t.id) as [TabBarStyleId, ...TabBarStyleId[]]);
// Dónde se ancla la foto del estudio cuando se recorta para la portada.
//
// ⚠️ Nace de un caso real, no de una petición estética. En cuanto la foto
// empezó a llegar al portal (PR #827), el primer estudio con foto tenía
// subido un PRIMER PLANO de una cara, no un interior de sala. `center` —lo
// correcto para una foto de estudio— dejaba el logo justo sobre la boca.
// El diseño da por hecha una foto apaisada de sala; la propietaria sube lo
// que tiene. Esto le deja ajustarlo sin recortar la imagen ni pedirle otra.
//
// Solo tres posiciones, no un porcentaje libre: el recorte se juzga a ojo y
// tres opciones se prueban en tres clics. Un deslizador pide precisión que
// aquí no aporta nada.
const fotoEncuadreSchema = z.enum(['arriba', 'centro', 'abajo']);

/** El `background-position` que le toca a cada encuadre. Único sitio donde se traduce. */
export const POSICION_FOTO: Record<'arriba' | 'centro' | 'abajo', string> = {
  arriba: 'center top',
  centro: 'center center',
  abajo: 'center bottom',
};

const barraOscuraSchema = z.boolean();
// Barra flotante (tema "Bloom"): eje INDEPENDIENTE de barraOscura, mismo
// mecanismo (var() con fallback, ver varsBarraFlotante en theme-runtime.ts) —
// nunca resucita la rama de render de `tabBarStyle` que portal-nav.tsx ya no
// lee (rediseño 2026-08, "pestaña activa" como único look). Los dos flags
// pueden convivir sin pisarse; ningún tema de hoy usa los dos a la vez.
const barraFlotanteSchema = z.boolean();
// Barra clásica (Oliva/Noir): pegada abajo, sin flotar, con borde superior —
// el look de ANTES del rediseño de 2026-08 ("único look de barra para todos
// los estudios", tras feedback de 49 propietarias). Reabre esa decisión a
// propósito, pero SOLO para los estudios con este flag activo: el resto
// sigue con la píldora flotante de siempre. Default false. Es un eje JS, no
// solo CSS — igual que `tabBarStyle`/`navPortal`, portal-shell.tsx decide con
// esto si monta <PortalNav flotante={false}>, algo que una var no puede
// decidir por sí sola (ver getThemePublicado/fetchPublicStudioData).
const barraClasicaSchema = z.boolean();
// Acento que NO es la marca (dorado de Noir, rosa de Bloom) — icono activo de
// la barra, borde de tarjeta reservada, punto de aviso. Antes de este campo,
// Noir reusaba `secondary` para ese papel (ver #640); con `destacado`
// explícito, `secondary` vuelve a ser "superficie suave" en los tres temas
// nuevos, como pide la tabla de valores del encargo.
const destacadoSchema = hexSchema;
// Radio por PIEZA — ver varsRadioTema en theme-runtime.ts. Parcial y
// opcional: sin este campo, todo el portal cae a los números fijos de
// siempre en lib/portal-tokens.ts/portal-design.ts. `card`/`boton` ya los
// leen tanto los componentes compartidos (Button.tsx/Card.tsx) como el resto
// de tarjetas/botones inline del portal (clases, bonos, hero) — no es solo
// la tarjeta de "próxima clase" (ver harmonic-discovering-kettle.md, ronda
// que cerró ese hueco tras el feedback "todos los temas son el mismo pero
// de otro color").
const radioTemaSchema = z.object({
  card: z.number().optional(),
  boton: z.number().optional(),
  chip: z.number().optional(),
  // Baldosa de "accesos rápidos" en la variante rejilla (20 en Oliva, 22 en
  // Bloom). Sin este campo la baldosa cae al radio de tarjeta de siempre.
  acceso: z.number().optional(),
}).strict();
// Escala tipográfica por PIEZA — mismo mecanismo que radioTema: parcial,
// opcional, y ausente = el número fijo de siempre en portal-design.ts.
//
// Los siete pasos y sus valores salen de `tokens/tokens.json` de los paquetes
// que entregó diseño (`typography.scale`), no de una elección nuestra.
//
// ⚠️ Es un token DEL TEMA, no una constante del producto: Noir y Oliva titulan
// sus secciones a 17 y Bloom a 20. Se llegó a recomendar una escala única para
// todos los estudios; los tokens del encargo lo contradicen y mandan ellos.
// Antes de esto el portal usaba 24 en unos rótulos y 30 en otros, sin criterio.
const escalaTextoSchema = z.object({
  /** Rótulo de sección ("Próxima clase", "Esta semana"). Hoy: 24 y 30. */
  seccion: z.number().optional(),
  /** Título de pantalla completa (Clases, Bonos). */
  tituloPantalla: z.number().optional(),
  /** "Hola, {nombre}" de la cabecera del Inicio. Hoy: 21. */
  saludo: z.number().optional(),
  /** Titular de la tarjeta principal (nombre de la clase). Hoy: 29. */
  tituloHero: z.number().optional(),
  /** Titular de la pantalla de bienvenida, antes del login. */
  bienvenida: z.number().optional(),
  /** Número grande de sesiones restantes en Bonos. */
  numeroBono: z.number().optional(),
  // ⚠️ El `typography.scale` del encargo trae un séptimo paso, `timer`, para
  // la cuenta atrás de la sesión guiada. NO se declara aquí: nuestro portal no
  // tiene esa pantalla. Declararlo sería exactamente lo que este proyecto
  // lleva pagando caro — un campo sin consumidor que parece que hace algo.
  // Cuando exista la pantalla, se añade.
}).strict();

// Variantes de FORMA por bloque — el catálogo vive en theme-variantes.ts
// (módulo puro), igual que navConfigSchema toma el suyo de portal-nav.ts. Todo
// opcional: ausente = el aspecto de hoy en todos los ejes.
//
// ⚠️ `.strict()` aquí significa que una clave DESCONOCIDA tumba el objeto
// entero y `pick` lo deja en `undefined` → todo al look de siempre. Es la
// dirección segura (nunca un estado a medias), pero es grosera; por eso el uso
// real pasa por `resolveVariantes()`, que valida clave a clave y salva las que
// sí son válidas.
const variantesSchema = z.object(
  Object.fromEntries(
    (Object.keys(VARIANTES_PORTAL) as EjeVariante[]).map((eje) => [
      eje,
      z.enum(VARIANTES_PORTAL[eje] as unknown as [string, ...string[]]).optional(),
    ]),
  ),
).strict();
const themeIdSchema = z.string();
const themeVersionSchema = z.number().int();
const themeCustomizedSchema = z.boolean();

/** Esquema completo de un tema válido (el que exige `publicar`). */
export const themeConfigSchema = z
  .object({
    primary: hexSchema,
    secondary: hexSchema,
    accent: hexSchema,
    background: hexSchema,
    text: hexSchema,
    fontId: fontIdSchema,
    radius: radiusSchema,
    faviconUrl: faviconSchema.default(null),
    // Compartir y buscadores — ver el comentario de los schemas arriba.
    // Vacío/null = se genera solo, que es lo que hacía antes de existir estos
    // campos: ningún tema guardado cambia de comportamiento.
    seoTitulo: seoTituloSchema.default(''),
    seoDescripcion: seoDescripcionSchema.default(''),
    seoImagenUrl: seoImagenSchema.default(null),
    // Portada del widget — ver arriba. Vacío = el texto por defecto.
    reservarTitular: reservarTitularSchema.default(''),
    reservarSubtitulo: reservarSubtituloSchema.default(''),
    reservarCta: reservarCtaSchema.default(''),
    // «Sobre nosotros» — ver arriba. Vacío = la sección no se pinta.
    reservarSobreTitulo: reservarSobreTituloSchema.default(''),
    reservarSobreTexto: reservarSobreTextoSchema.default(''),
    widgetFondo: widgetFondoSchema.default(null),
    widgetFuente: widgetFuenteSchema.default(null),
    widgetOcultarPie: z.boolean().default(false),
    widgetSoloPestana: z.boolean().default(false),
    widgetTexto: widgetTextoSchema.default('auto'),
    // Opcionales con default: un tema guardado ANTES de esta fase no trae
    // estos campos, y debe seguir viéndose exactamente igual (solid/flat).
    buttonStyle: buttonStyleSchema.default('solid'),
    cardStyle: cardStyleSchema.default('flat'),
    // Titular del portal cliente — ver ESTILOS_TITULAR_PORTAL arriba.
    portalHeadingFontId: portalHeadingFontSchema.default('instrumentSerif'),
    // Barra inferior del portal cliente — ver ESTILOS_TAB_BAR arriba.
    tabBarStyle: tabBarStyleSchema.default('clasica'),
    // Barra inferior del portal sobre fondo oscuro, con el icono activo en el
    // color secundario (tema "Noir"). Eje aparte de tabBarStyle: aquel decide
    // la FORMA de la pastilla activa, este el CONTRASTE de toda la barra.
    // Default false: un tema guardado antes de esta fase sigue viéndose igual.
    barraOscura: barraOscuraSchema.default(false),
    // Encuadre de la foto del estudio en la portada — ver el schema arriba.
    // 'centro' es lo que hacía antes, así que ningún tema guardado cambia.
    fotoEncuadre: fotoEncuadreSchema.default('centro'),
    // Barra flotante sobre el fondo (tema "Bloom") — ver comentario del
    // schema arriba. Default false: sin cambios para nadie que no lo pida.
    barraFlotante: barraFlotanteSchema.default(false),
    // Barra clásica, no flotante (Oliva/Noir) — ver comentario del schema
    // arriba. Default false: sin cambios para nadie que no lo pida.
    barraClasica: barraClasicaSchema.default(false),
    // Acento fuera de la marca (dorado/rosa) — ver comentario del schema
    // arriba. Sin default explícito con valor propio: si el estudio no lo
    // toca, cae a `secondary` en el render (mismo criterio de "hereda del
    // tema" que ya usa `EstiloBloque` en portal-home-bloques.ts) — por eso es
    // `.nullable().default(null)`, no un hex fijo que fingiría una elección.
    destacado: destacadoSchema.nullable().default(null),
    // Radio por pieza de las secciones nuevas — ver comentario del schema
    // arriba. Ausente = las piezas nuevas caen a los números fijos de
    // portal-design.ts, como si el campo no existiera.
    radioTema: radioTemaSchema.optional(),
    // Escala tipográfica por pieza — ver comentario del schema arriba.
    escalaTexto: escalaTextoSchema.optional(),
    // Variantes de forma por bloque — ver comentario del schema arriba.
    // Ausente = el aspecto de hoy en todos los ejes.
    variantes: variantesSchema.optional(),
    // Pestañas ocultas/renombradas de esa misma barra (Fase 2 del Theme
    // Builder) — ver lib/portal-nav.ts. Independiente de tabBarStyle: uno
    // decide el LOOK de la barra, este decide QUÉ pestañas tiene.
    navPortal: navConfigSchema,
    // Redes sociales del pie de página público (Fase 3) — ver REDES_SOCIALES_IDS arriba.
    redesSociales: redesSocialesSchema,
    // Galería de temas (lib/theme-definitions.ts): de qué ThemeDefinition (y
    // qué versión) partió este tema, y si el estudio lo ha tocado a mano
    // después de elegirlo. Metadato de procedencia — no gobierna el render
    // por sí mismo, es trazabilidad para un futuro flujo de "hay una v2 de tu
    // tema" sin migración ni romper a quien se quede en la v1.
    themeId: themeIdSchema.default('classic'),
    themeVersion: themeVersionSchema.default(1),
    themeCustomized: themeCustomizedSchema.default(false),
  })
  .strict();

export type ThemeConfig = z.infer<typeof themeConfigSchema>;

/** Esquema parcial para guardar BORRADOR mientras se edita. */
export const themeDraftSchema = themeConfigSchema.partial();
export type ThemeDraft = z.infer<typeof themeDraftSchema>;

/** Tema por defecto del sistema (identidad Tentare: oliva + arena). */
export const DEFAULT_THEME: ThemeConfig = {
  primary: '#343825',
  secondary: '#5A6142',
  accent: '#F1F2EA',
  background: '#F6F7F9',
  text: '#1A1A1A',
  fontId: 'jakarta',
  radius: 'rounded',
  faviconUrl: null,
  seoTitulo: '',
  seoDescripcion: '',
  seoImagenUrl: null,
  reservarTitular: '',
  reservarSubtitulo: '',
  reservarCta: '',
  reservarSobreTitulo: '',
  reservarSobreTexto: '',
  widgetFondo: null,
  widgetFuente: null,
  widgetOcultarPie: false,
  widgetSoloPestana: false,
  widgetTexto: 'auto',
  buttonStyle: 'solid',
  cardStyle: 'flat',
  portalHeadingFontId: 'instrumentSerif',
  tabBarStyle: 'clasica',
  barraOscura: false,
  fotoEncuadre: 'centro',
  barraFlotante: false,
  barraClasica: false,
  destacado: null,
  radioTema: undefined,
  escalaTexto: undefined,
  variantes: undefined,
  navPortal: DEFAULT_NAV_CONFIG,
  redesSociales: { instagram: '', facebook: '', whatsapp: '' },
  themeId: 'classic',
  themeVersion: 1,
  themeCustomized: false,
};

/**
 * Lo que NO es del tema: sobrevive a instalar otro.
 *
 * `faviconUrl` es el icono del estudio; `navPortal` y `redesSociales` son
 * decisiones suyas sobre qué enseña su portal. Cambiar de Oliva a Noir no
 * puede borrarle el favicon ni reordenarle el menú.
 *
 * Los tres `seo*` van aquí por el mismo motivo, y es el caso más claro de
 * todos: el título con el que sales en Google y la foto que se ve al pegar
 * tu enlace en un grupo de WhatsApp son TEXTO DE TU NEGOCIO, no aspecto. Que
 * probar un tema nuevo te borrara la descripción que escribiste —y encima en
 * silencio, porque no se ve en ninguna pantalla del panel— sería la peor
 * clase de pérdida: la que no te enteras hasta que alguien te dice que tu
 * enlace se ve raro.
 *
 * Todo lo demás de `ThemeConfig` es aspecto y se REEMPLAZA por completo.
 */
export const CAMPOS_DEL_ESTUDIO = [
  'faviconUrl', 'navPortal', 'redesSociales',
  'seoTitulo', 'seoDescripcion', 'seoImagenUrl',
  // Mismo motivo: el titular que el estudio escribe para SU web no es aspecto,
  // y cambiar de tema no puede borrárselo.
  'reservarTitular', 'reservarSubtitulo', 'reservarCta',
  // Y con más motivo lo que el estudio cuenta de SÍ MISMO: instalar otro tema
  // no puede borrar el texto en el que ha contado quién es.
  'reservarSobreTitulo', 'reservarSobreTexto',
  // Y la apariencia del widget: describe cómo encaja en la web del ESTUDIO, no
  // cómo se ve el portal. Instalar otro tema no puede descuadrarle su web.
  'widgetFondo', 'widgetFuente', 'widgetOcultarPie', 'widgetSoloPestana', 'widgetTexto',
] as const;

/** Lo que sí es del tema. Se calcula, no se escribe a mano: así no puede
 *  quedarse desactualizada al añadir un campo. */
export const CAMPOS_DEL_TEMA = (Object.keys(DEFAULT_THEME) as (keyof ThemeConfig)[])
  .filter((k) => !(CAMPOS_DEL_ESTUDIO as readonly string[]).includes(k));

/**
 * Instalar un tema es SUSTITUIR, no fusionar.
 *
 * ⚠️ Antes era `{ ...draft, ...defaults }`, y ese `...draft` es el bug: todo
 * eje que el tema nuevo no declarase sobrevivía del anterior. Noir declara
 * `barraOscura: true`; Oliva declara `barraClasica: true` pero no pone la
 * oscura a `false`, así que se quedaba. Encontrado en un estudio real con
 * `barraOscura`, `barraClasica` Y `barraFlotante` a `true` a la vez, y el
 * gate de contraste avisando de "la barra oscura" en un tema que no la tiene.
 *
 * Ahora: se parte de los valores por defecto (reset), se conserva únicamente
 * lo que es del ESTUDIO y no del tema, y encima se aplica el tema elegido.
 *
 * Los objetos anidados se CLONAN: sin eso, dos estudios con el mismo tema
 * compartirían la referencia de la constante del módulo y editar una variante
 * en uno la cambiaría en el otro.
 */
export function instalarTema(
  draft: ThemeConfig,
  defaults: Partial<ThemeConfig>,
  meta: { themeId: string; themeVersion: number },
): ThemeConfig {
  const base: ThemeConfig = { ...DEFAULT_THEME };
  for (const campo of CAMPOS_DEL_ESTUDIO) {
    (base as Record<string, unknown>)[campo] = draft[campo];
  }
  return {
    ...base,
    ...defaults,
    ...(defaults.variantes ? { variantes: { ...defaults.variantes } } : {}),
    ...(defaults.radioTema ? { radioTema: { ...defaults.radioTema } } : {}),
    ...(defaults.escalaTexto ? { escalaTexto: { ...defaults.escalaTexto } } : {}),
    ...(defaults.redesSociales ? { redesSociales: { ...defaults.redesSociales } } : {}),
    themeId: meta.themeId,
    themeVersion: meta.themeVersion,
    themeCustomized: false,
  };
}

/**
 * Fallback robusto: convierte cualquier valor crudo (jsonb de la DB, null,
 * parcial o corrupto) en un tema válido completo, tomando el default por CADA
 * token que falte o no valide. Nunca lanza.
 */
export function resolveTheme(raw: unknown): ThemeConfig {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const pick = <K extends keyof ThemeConfig>(clave: K, esquema: z.ZodType): ThemeConfig[K] => {
    const r = esquema.safeParse(obj[clave]);
    return (r.success ? r.data : DEFAULT_THEME[clave]) as ThemeConfig[K];
  };
  return {
    primary: pick('primary', hexSchema),
    secondary: pick('secondary', hexSchema),
    accent: pick('accent', hexSchema),
    background: pick('background', hexSchema),
    text: pick('text', hexSchema),
    fontId: pick('fontId', fontIdSchema),
    radius: pick('radius', radiusSchema),
    faviconUrl: pick('faviconUrl', faviconSchema),
    seoTitulo: pick('seoTitulo', seoTituloSchema),
    seoDescripcion: pick('seoDescripcion', seoDescripcionSchema),
    seoImagenUrl: pick('seoImagenUrl', seoImagenSchema),
    reservarTitular: pick('reservarTitular', reservarTitularSchema),
    reservarSubtitulo: pick('reservarSubtitulo', reservarSubtituloSchema),
    reservarCta: pick('reservarCta', reservarCtaSchema),
    reservarSobreTitulo: pick('reservarSobreTitulo', reservarSobreTituloSchema),
    reservarSobreTexto: pick('reservarSobreTexto', reservarSobreTextoSchema),
    widgetFondo: pick('widgetFondo', widgetFondoSchema),
    widgetFuente: pick('widgetFuente', widgetFuenteSchema),
    widgetOcultarPie: pick('widgetOcultarPie', z.boolean()),
    widgetSoloPestana: pick('widgetSoloPestana', z.boolean()),
    widgetTexto: pick('widgetTexto', widgetTextoSchema),
    buttonStyle: pick('buttonStyle', buttonStyleSchema),
    cardStyle: pick('cardStyle', cardStyleSchema),
    portalHeadingFontId: pick('portalHeadingFontId', portalHeadingFontSchema),
    tabBarStyle: pick('tabBarStyle', tabBarStyleSchema),
    barraOscura: pick('barraOscura', barraOscuraSchema),
    fotoEncuadre: pick('fotoEncuadre', fotoEncuadreSchema),
    barraFlotante: pick('barraFlotante', barraFlotanteSchema),
    barraClasica: pick('barraClasica', barraClasicaSchema),
    destacado: pick('destacado', destacadoSchema.nullable()),
    radioTema: pick('radioTema', radioTemaSchema.optional()),
    escalaTexto: pick('escalaTexto', escalaTextoSchema.optional()),
    variantes: pick('variantes', variantesSchema.optional()),
    navPortal: pick('navPortal', navConfigSchema),
    redesSociales: pick('redesSociales', redesSocialesSchema),
    themeId: pick('themeId', themeIdSchema),
    themeVersion: pick('themeVersion', themeVersionSchema),
    themeCustomized: pick('themeCustomized', themeCustomizedSchema),
  };
}

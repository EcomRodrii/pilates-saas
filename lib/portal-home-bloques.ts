// ═══════════════════════════════════════════════════════════════════════════
// Constructor de bloques del portal (Theme Builder — Fase 1 de la
// generalización, sobre la Fase 3 del editor de temas)
// ═══════════════════════════════════════════════════════════════════════════
//
// Fase 3 construyó el constructor tipo Shopify Sections SOLO para el Inicio
// del portal: una lista ordenada de "bloques", donde los módulos de siempre
// son bloques `sistema` y se pueden AÑADIR bloques del catálogo
// (banner/texto/cta/faq) con su propia configuración.
//
// Esta fase generaliza ese MISMO modelo a Clases y Bonos, en vez de crear un
// sistema nuevo por pantalla: cada pantalla tiene su propia lista de bloques
// `sistema` (Home conserva sus 4 de siempre; Clases/Bonos tienen uno solo, su
// propio contenido funcional, que nunca se puede quitar del todo) más el
// mismo catálogo añadible, ya genérico, sin cambios.
//
// `PANTALLA_IDS`/`BLOQUES_SISTEMA_POR_PANTALLA` son la ÚNICA lista a tocar
// para dar de alta una pantalla nueva en el constructor de bloques — así una
// pantalla futura hereda el sistema añadiendo una entrada, no construyendo
// uno desde cero.
//
// Puro (sin zod, sin React) para poder usarse en el bundle de cliente sin
// arrastrar peso — mismo principio que layout-runtime.ts. La validación con
// zod vive en layout-schema.ts, que envuelve estos mismos tipos.

export const PANTALLA_IDS = ['home', 'clases', 'bonos'] as const;
export type PantallaId = (typeof PANTALLA_IDS)[number];

export const PANTALLA_LABEL: Record<PantallaId, string> = {
  home: 'Inicio',
  clases: 'Clases',
  bonos: 'Bonos',
};

export const BLOQUES_SISTEMA_IDS = [
  'estaSemana', 'accesosRapidos', 'invitarAmiga', 'contenidoEstudio', 'listadoClases', 'listadoBonos',
  // Tema "Oliva"/"Noir" — ver lib/theme-definitions.ts (bloquesHome). Ninguno
  // aparece en un estudio que no los active a mano o instale uno de esos
  // temas: se añaden al FINAL de BLOQUES_SISTEMA_POR_PANTALLA.home, así que
  // no cambian el orden por defecto de nadie que ya tenga bloques guardados.
  'tiraSemana', 'progresoSemanal',
] as const;
export type BloqueSistemaId = (typeof BLOQUES_SISTEMA_IDS)[number];

export const BLOQUE_SISTEMA_LABEL: Record<BloqueSistemaId, string> = {
  estaSemana: 'Esta semana',
  accesosRapidos: 'Accesos rápidos (reservas, progreso, notificaciones, equipo)',
  invitarAmiga: 'Invita a una amiga',
  contenidoEstudio: 'Contenido del estudio (mensaje destacado y banners)',
  listadoClases: 'Calendario de clases',
  listadoBonos: 'Tu bono y accesos rápidos',
  tiraSemana: 'Tira de la semana (7 días, con punto si hay clase reservada)',
  progresoSemanal: 'Progreso semanal (anillo con tus reservas de esta semana)',
};

// Qué bloques `sistema` tiene cada pantalla, en su orden por defecto. Se
// pueden reordenar/ocultar como cualquier otro bloque, pero no eliminar: son
// el contenido funcional de la pantalla, no decorativo. `tiraSemana`/
// `progresoSemanal` van OCULTOS por defecto (ver bloqueSistema() más abajo)
// — un estudio que no instale Oliva/Noir ni los active a mano no los ve.
export const BLOQUES_SISTEMA_POR_PANTALLA: Record<PantallaId, readonly BloqueSistemaId[]> = {
  home: ['estaSemana', 'accesosRapidos', 'invitarAmiga', 'contenidoEstudio', 'tiraSemana', 'progresoSemanal'],
  clases: ['listadoClases'],
  bonos: ['listadoBonos'],
};

export interface BannerConfig {
  imagenUrl: string;
  titulo: string;
  texto: string;
  href: string;
}
export interface TextoConfig {
  titulo: string;
  texto: string;
}
export interface CtaConfig {
  titulo: string;
  textoBoton: string;
  href: string;
}
export interface FaqConfig {
  titulo: string;
  preguntas: Array<{ pregunta: string; respuesta: string }>;
}
export interface GaleriaConfig {
  imagenes: Array<{ url: string; alt: string }>;
}
export interface VideoConfig {
  titulo: string;
  url: string;
}
export interface TestimoniosConfig {
  titulo: string;
  testimonios: Array<{ cita: string; autor: string; rol: string }>;
}

// Estilo PROPIO de una sección — pedido explícitamente por el usuario ("no es
// nada personalizable, tiene que ser un constructor totalmente libre"): antes
// solo existía el tema global (Ajustes), así que un banner y un CTA no podían
// distinguirse visualmente entre sí por mucho que el estudio quisiera. Cada
// bloque del CATÁLOGO (no los `sistema` — esos son UI de producto, no
// contenido de la propietaria) puede pisar el tema global para sí mismo.
// Todo opcional: sin `estilo`, el bloque se ve exactamente como antes
// (hereda del tema), así que temas ya guardados no cambian de aspecto solos.
//
// `tamanoTexto`/`esquinas`/`sombra` son enums que INDEXAN los tokens ya
// existentes en lib/portal-design.ts (mismo principio que `espaciado` con
// ESPACIADO_PADDING) — nunca un número libre nuevo, para no fragmentar la
// escala visual del resto del portal.
export interface EstiloBloque {
  fondo?: string | null;
  color?: string | null;
  alineacion?: 'izquierda' | 'centro' | 'derecha';
  espaciado?: 'compacto' | 'normal' | 'amplio';
  tamanoTexto?: 'pequeno' | 'normal' | 'grande';
  esquinas?: 'ninguna' | 'suave' | 'redondeada' | 'pill';
  sombra?: 'ninguna' | 'suave' | 'marcada';
  ancho?: 'completo' | 'contenido';
}

export type BloqueHome =
  | { id: string; kind: 'sistema'; sistemaId: BloqueSistemaId; oculto?: boolean }
  | { id: string; kind: 'banner'; config: BannerConfig; oculto?: boolean; estilo?: EstiloBloque }
  | { id: string; kind: 'texto'; config: TextoConfig; oculto?: boolean; estilo?: EstiloBloque }
  | { id: string; kind: 'cta'; config: CtaConfig; oculto?: boolean; estilo?: EstiloBloque }
  | { id: string; kind: 'faq'; config: FaqConfig; oculto?: boolean; estilo?: EstiloBloque }
  | { id: string; kind: 'galeria'; config: GaleriaConfig; oculto?: boolean; estilo?: EstiloBloque }
  | { id: string; kind: 'video'; config: VideoConfig; oculto?: boolean; estilo?: EstiloBloque }
  | { id: string; kind: 'testimonios'; config: TestimoniosConfig; oculto?: boolean; estilo?: EstiloBloque };

export type BloqueTipoCatalogo = Exclude<BloqueHome['kind'], 'sistema'>;

// Catálogo de lo que se puede AÑADIR desde el picker del editor — los bloques
// `sistema` no están aquí porque no se "añaden", ya existen siempre por
// defecto (ver DEFAULT_BLOQUES_POR_PANTALLA). Icono como nombre de
// lucide-react (string, no el componente) para no meter React en este módulo
// puro — el editor resuelve el nombre a un icono real. Mismo catálogo para
// las tres pantallas: un banner/CTA/FAQ es igual de válido en Clases o Bonos
// que en Inicio.
export interface BlockCatalogEntry<K extends BloqueTipoCatalogo = BloqueTipoCatalogo> {
  kind: K;
  label: string;
  descripcion: string;
  icono: string;
  defaultConfig: Extract<BloqueHome, { kind: K }>['config'];
}

export const BLOCK_CATALOG: BlockCatalogEntry[] = [
  {
    kind: 'banner', label: 'Banner', icono: 'Image',
    descripcion: 'Imagen a todo lo ancho con título, texto y enlace opcional.',
    defaultConfig: { imagenUrl: '', titulo: '', texto: '', href: '' } satisfies BannerConfig,
  },
  {
    kind: 'texto', label: 'Texto', icono: 'Type',
    descripcion: 'Un bloque de texto libre, con título opcional.',
    defaultConfig: { titulo: '', texto: '' } satisfies TextoConfig,
  },
  {
    kind: 'cta', label: 'Llamada a la acción', icono: 'MousePointerClick',
    descripcion: 'Título y un botón que lleva a donde quieras.',
    defaultConfig: { titulo: '', textoBoton: '', href: '' } satisfies CtaConfig,
  },
  {
    kind: 'faq', label: 'Preguntas frecuentes', icono: 'HelpCircle',
    descripcion: 'Lista de preguntas y respuestas, plegable.',
    defaultConfig: { titulo: '', preguntas: [] } satisfies FaqConfig,
  },
  {
    kind: 'galeria', label: 'Galería de imágenes', icono: 'GalleryHorizontal',
    descripcion: 'Varias imágenes en un carrusel horizontal.',
    defaultConfig: { imagenes: [] } satisfies GaleriaConfig,
  },
  {
    kind: 'video', label: 'Vídeo', icono: 'Video',
    descripcion: 'Un vídeo embebido de YouTube o Vimeo.',
    defaultConfig: { titulo: '', url: '' } satisfies VideoConfig,
  },
  {
    kind: 'testimonios', label: 'Testimonios', icono: 'Quote',
    descripcion: 'Citas de socias, con autora y rol opcional.',
    defaultConfig: { titulo: '', testimonios: [] } satisfies TestimoniosConfig,
  },
];

export function getBlockCatalogEntry(kind: string): BlockCatalogEntry | undefined {
  return BLOCK_CATALOG.find((b) => b.kind === kind);
}

// Ocultos por defecto: los que ningún estudio ve hasta que instala el tema
// que los pide (lib/theme-definitions.ts, bloquesHome) o los activa a mano.
const SISTEMA_OCULTO_POR_DEFECTO = new Set<BloqueSistemaId>(['tiraSemana', 'progresoSemanal']);

function bloqueSistema(sistemaId: BloqueSistemaId): BloqueHome {
  return SISTEMA_OCULTO_POR_DEFECTO.has(sistemaId)
    ? { id: `sistema-${sistemaId}`, kind: 'sistema', sistemaId, oculto: true }
    : { id: `sistema-${sistemaId}`, kind: 'sistema', sistemaId };
}

// Por defecto (ningún estudio ha tocado esto todavía): los bloques `sistema`
// de cada pantalla, en su orden por defecto, visibles salvo los que se
// activan por tema (ver SISTEMA_OCULTO_POR_DEFECTO arriba).
export const DEFAULT_BLOQUES_POR_PANTALLA: Record<PantallaId, BloqueHome[]> = {
  home: BLOQUES_SISTEMA_POR_PANTALLA.home.map(bloqueSistema),
  clases: BLOQUES_SISTEMA_POR_PANTALLA.clases.map(bloqueSistema),
  bonos: BLOQUES_SISTEMA_POR_PANTALLA.bonos.map(bloqueSistema),
};
/** @deprecated usar DEFAULT_BLOQUES_POR_PANTALLA.home */
export const DEFAULT_HOME_BLOQUES: BloqueHome[] = DEFAULT_BLOQUES_POR_PANTALLA.home;

export interface HomeBloquesShape {
  draft: BloqueHome[];
  publicado: BloqueHome[];
}
export type BloquesPorPantallaShape = Record<PantallaId, HomeBloquesShape>;

export const DEFAULT_BLOQUES_SHAPE: BloquesPorPantallaShape = {
  home: { draft: DEFAULT_BLOQUES_POR_PANTALLA.home, publicado: DEFAULT_BLOQUES_POR_PANTALLA.home },
  clases: { draft: DEFAULT_BLOQUES_POR_PANTALLA.clases, publicado: DEFAULT_BLOQUES_POR_PANTALLA.clases },
  bonos: { draft: DEFAULT_BLOQUES_POR_PANTALLA.bonos, publicado: DEFAULT_BLOQUES_POR_PANTALLA.bonos },
};
/** @deprecated usar DEFAULT_BLOQUES_SHAPE.home */
export const DEFAULT_HOME_BLOQUES_SHAPE: HomeBloquesShape = DEFAULT_BLOQUES_SHAPE.home;

/**
 * Resuelve los bloques de UNA pantalla. Mismo principio que resolveTheme():
 * ante cualquier duda cae al default visual de siempre, nunca lanza.
 *
 * `legacyPortalHome` solo se usa (y solo tiene sentido) para `home`: es la
 * compatibilidad con Fase 2, que dejaba reordenar/ocultar sus 4 módulos fijos
 * antes de que existiera este constructor de bloques. Un estudio que ya
 * reordenó en Fase 2 ve EXACTAMENTE lo mismo al entrar aquí, sin migrar
 * datos. Clases y Bonos no tienen legado que migrar — si no hay nada
 * guardado, arrancan siempre con su único bloque sistema.
 */
export function resolveBloquesPantalla(
  raw: unknown,
  pantallaId: PantallaId,
  legacyPortalHome?: { orden: string[]; ocultos: string[] },
): HomeBloquesShape {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const draft = Array.isArray(obj.draft) ? (obj.draft as BloqueHome[]) : [];
  const publicado = Array.isArray(obj.publicado) ? (obj.publicado as BloqueHome[]) : [];

  if (draft.length > 0 || publicado.length > 0) {
    return { draft: draft.length > 0 ? draft : publicado, publicado };
  }

  if (pantallaId === 'home' && legacyPortalHome) {
    const sistemaIds = BLOQUES_SISTEMA_POR_PANTALLA.home;
    const legacyOcultos = new Set(legacyPortalHome.ocultos);
    const ordenLegacy = [
      ...legacyPortalHome.orden.filter((id): id is BloqueSistemaId => (sistemaIds as readonly string[]).includes(id)),
      ...sistemaIds.filter((id) => !legacyPortalHome.orden.includes(id)),
    ];
    const sintetizado = ordenLegacy.map((id) => (legacyOcultos.has(id) ? { ...bloqueSistema(id), oculto: true } : bloqueSistema(id)));
    return { draft: sintetizado, publicado: sintetizado };
  }

  return DEFAULT_BLOQUES_SHAPE[pantallaId];
}

/** Bloques visibles, en orden — lo que de verdad se pinta en la pantalla. */
export function bloquesVisibles(bloques: BloqueHome[]): BloqueHome[] {
  return bloques.filter((b) => !b.oculto);
}

/**
 * Resuelve el `href` de un bloque (banner/cta) a algo seguro para enlazar, o
 * `null` si no lo es. No basta con validar en el editor: el dato viene de
 * jsonb guardado por el estudio, que pudo teclear cualquier cosa. Un link
 * interno es una ruta ("/reservar"); uno externo solo se acepta si es
 * http(s) — nada de `javascript:`/`data:`. Mismo criterio que
 * hrefExternoSeguro() en app/portal/[slug]/home/page.tsx (banners legacy).
 */
export function resolverHrefBloque(href: string): { interno: true; valor: string } | { interno: false; valor: string } | null {
  const v = href.trim();
  if (!v) return null;
  if (v.startsWith('/')) return { interno: true, valor: v };
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:' ? { interno: false, valor: v } : null;
  } catch {
    return null;
  }
}

/**
 * Resuelve la URL de un bloque `video` a una URL de EMBED segura, o `null`
 * si no lo es. El dato viene de jsonb tecleado por el estudio — nunca se
 * mete crudo en un `<iframe src>`: solo YouTube/Vimeo por whitelist de host,
 * mismo criterio de "validar en el render, no solo en el editor" que
 * resolverHrefBloque().
 */
export function resolverVideoEmbed(url: string): string | null {
  const v = url.trim();
  if (!v) return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\./, '');

  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const id = u.pathname === '/watch' ? u.searchParams.get('v') : u.pathname.startsWith('/embed/') ? u.pathname.slice('/embed/'.length) : null;
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1);
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (host === 'vimeo.com') {
    const id = u.pathname.slice(1).split('/')[0];
    return /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
  }
  if (host === 'player.vimeo.com') {
    return u.pathname.startsWith('/video/') ? v : null;
  }
  return null;
}

/**
 * Si un bloque del catálogo tiene contenido suficiente para pintarse de
 * verdad. Espeja EXACTAMENTE las condiciones de "return null" de cada
 * componente en components/portal/bloque-home-render.tsx — misma fuente de
 * verdad para el render y para el gate de "antes de publicar" del editor
 * (lib/portal-home-bloques.test.ts prueba que un bloque incompleto aquí es
 * el mismo que se pinta vacío allí; no duplicar la lógica en el editor).
 * `banner` nunca está incompleto: se pinta con o sin imagen/enlace.
 */
export function bloqueEstaCompleto(b: Exclude<BloqueHome, { kind: 'sistema' }>): boolean {
  if (b.kind === 'banner') return true;
  if (b.kind === 'texto') return !!(b.config.titulo || b.config.texto);
  if (b.kind === 'cta') return resolverHrefBloque(b.config.href) !== null && !!b.config.textoBoton;
  if (b.kind === 'faq') return b.config.preguntas.length > 0;
  if (b.kind === 'galeria') return b.config.imagenes.length > 0;
  if (b.kind === 'video') return resolverVideoEmbed(b.config.url) !== null;
  return b.config.testimonios.length > 0;
}

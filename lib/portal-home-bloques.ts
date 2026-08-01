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
] as const;
export type BloqueSistemaId = (typeof BLOQUES_SISTEMA_IDS)[number];

export const BLOQUE_SISTEMA_LABEL: Record<BloqueSistemaId, string> = {
  estaSemana: 'Esta semana',
  accesosRapidos: 'Accesos rápidos (reservas, progreso, notificaciones, equipo)',
  invitarAmiga: 'Invita a una amiga',
  contenidoEstudio: 'Contenido del estudio (mensaje destacado y banners)',
  listadoClases: 'Calendario de clases',
  listadoBonos: 'Tu bono y accesos rápidos',
};

// Qué bloques `sistema` tiene cada pantalla, en su orden por defecto. Se
// pueden reordenar/ocultar como cualquier otro bloque, pero no eliminar: son
// el contenido funcional de la pantalla, no decorativo.
export const BLOQUES_SISTEMA_POR_PANTALLA: Record<PantallaId, readonly BloqueSistemaId[]> = {
  home: ['estaSemana', 'accesosRapidos', 'invitarAmiga', 'contenidoEstudio'],
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

export type BloqueHome =
  | { id: string; kind: 'sistema'; sistemaId: BloqueSistemaId; oculto?: boolean }
  | { id: string; kind: 'banner'; config: BannerConfig; oculto?: boolean }
  | { id: string; kind: 'texto'; config: TextoConfig; oculto?: boolean }
  | { id: string; kind: 'cta'; config: CtaConfig; oculto?: boolean }
  | { id: string; kind: 'faq'; config: FaqConfig; oculto?: boolean };

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
];

export function getBlockCatalogEntry(kind: string): BlockCatalogEntry | undefined {
  return BLOCK_CATALOG.find((b) => b.kind === kind);
}

function bloqueSistema(sistemaId: BloqueSistemaId): BloqueHome {
  return { id: `sistema-${sistemaId}`, kind: 'sistema', sistemaId };
}

// Por defecto (ningún estudio ha tocado esto todavía): los bloques `sistema`
// de cada pantalla, en su orden por defecto, visibles.
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

// ═══════════════════════════════════════════════════════════════════════════
// Constructor de bloques del Inicio del portal (Fase 3 del editor de temas)
// ═══════════════════════════════════════════════════════════════════════════
//
// Fase 2 (lib/portal-home-sections.ts) dejó reordenar/ocultar 4 módulos FIJOS.
// Esta fase generaliza eso a una lista ordenada de "bloques": los 4 módulos de
// siempre siguen existiendo como bloques `sistema` (mismo contenido, ahora
// como entradas de esta lista en vez de un `{orden, ocultos}` aparte), y se
// pueden AÑADIR bloques nuevos de un catálogo (banner/texto/cta/faq) con su
// propia configuración — el mecanismo real de "constructor tipo Shopify".
//
// Puro (sin zod, sin React) para poder usarse en el bundle de cliente sin
// arrastrar peso — mismo principio que layout-runtime.ts. La validación con
// zod vive en layout-schema.ts, que envuelve estos mismos tipos.

export const BLOQUES_SISTEMA_IDS = ['estaSemana', 'accesosRapidos', 'invitarAmiga', 'contenidoEstudio'] as const;
export type BloqueSistemaId = (typeof BLOQUES_SISTEMA_IDS)[number];

export const BLOQUE_SISTEMA_LABEL: Record<BloqueSistemaId, string> = {
  estaSemana: 'Esta semana',
  accesosRapidos: 'Accesos rápidos (reservas, progreso, notificaciones, equipo)',
  invitarAmiga: 'Invita a una amiga',
  contenidoEstudio: 'Contenido del estudio (mensaje destacado y banners)',
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
// defecto (ver DEFAULT_HOME_BLOQUES). Icono como nombre de lucide-react (string,
// no el componente) para no meter React en este módulo puro — el editor
// resuelve el nombre a un icono real.
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

// Por defecto (ningún estudio ha tocado esto todavía): los 4 módulos de
// siempre, en el orden de siempre, visibles. Bit a bit lo mismo que
// PORTAL_HOME_SECCIONES + portalHome vacío en Fase 2.
export const DEFAULT_HOME_BLOQUES: BloqueHome[] = BLOQUES_SISTEMA_IDS.map(bloqueSistema);

export interface HomeBloquesShape {
  draft: BloqueHome[];
  publicado: BloqueHome[];
}
export const DEFAULT_HOME_BLOQUES_SHAPE: HomeBloquesShape = {
  draft: DEFAULT_HOME_BLOQUES,
  publicado: DEFAULT_HOME_BLOQUES,
};

/**
 * Compatibilidad con Fase 2: si `publicado`/`draft` ya tienen algo, se
 * respeta tal cual (es la fuente de verdad desde que el estudio guarda un
 * borrador con este sistema). Si están vacíos, se sintetizan los 4 bloques
 * `sistema` a partir del `{orden, ocultos}` legacy de `portalHome` — un
 * estudio que ya reordenó en Fase 2 ve EXACTAMENTE lo mismo al entrar aquí,
 * sin migrar datos. Mismo principio que `resolveTheme()`: nunca lanza, ante
 * cualquier duda cae al default visual de siempre.
 */
export function resolveHomeBloques(
  raw: unknown,
  portalHomeLegacy: { orden: string[]; ocultos: string[] },
): HomeBloquesShape {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const draft = Array.isArray(obj.draft) ? (obj.draft as BloqueHome[]) : [];
  const publicado = Array.isArray(obj.publicado) ? (obj.publicado as BloqueHome[]) : [];

  if (draft.length > 0 || publicado.length > 0) {
    return { draft: draft.length > 0 ? draft : publicado, publicado };
  }

  const legacyOcultos = new Set(portalHomeLegacy.ocultos);
  const ordenLegacy = [
    ...portalHomeLegacy.orden.filter((id): id is BloqueSistemaId => (BLOQUES_SISTEMA_IDS as readonly string[]).includes(id)),
    ...BLOQUES_SISTEMA_IDS.filter((id) => !portalHomeLegacy.orden.includes(id)),
  ];
  const sintetizado = ordenLegacy.map((id) => (legacyOcultos.has(id) ? { ...bloqueSistema(id), oculto: true } : bloqueSistema(id)));
  return { draft: sintetizado, publicado: sintetizado };
}

/** Bloques visibles, en orden — lo que de verdad se pinta en la Home. */
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

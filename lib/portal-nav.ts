// ═══════════════════════════════════════════════════════════════════════════
// Navegación inferior del portal cliente (Theme Builder — Fase 2)
// ═══════════════════════════════════════════════════════════════════════════
//
// Permite ocultar pestañas y sustituir su etiqueta/icono. Deliberadamente SIN
// reordenar — mismo motivo que ya descartó el `MenuEditor` del dashboard
// (ver comentario "principio 6" en layout-runtime.ts): un orden fijo entre
// estudios es más fácil de aprender una vez y sirve para todos, y aquí además
// evita romper el `activeIndex`/pastilla deslizante de portal-shell.tsx, que
// asume el mismo orden que la ruta activa. Más conservador a propósito que la
// idea original de reordenar, que ya rompió el render una vez.
//
// Puro (sin React) — igual que portal-home-bloques.ts — para no arrastrar
// lucide-react a este módulo. La resolución de icono→componente vive en
// components/portal/portal-nav.tsx.

import { PORTAL_VIDEOS_CONGELADO } from './frozen-features.ts';

// Reconstrucción "Tentare Studio App" (2026-08): la barra real del diseño de
// Claude Design tiene 4 pestañas, no 5 — Clases/Bonos se fusionan en una
// única pantalla "Reservas" (plaza fija+bono+pagos+historial ya en un solo
// scroll) y aparece "Buscar" como pestaña nueva de verdad, no un overlay.
// "Vídeos" desaparece del catálogo — sigue congelado por producto
// (PORTAL_VIDEOS_CONGELADO en frozen-features.ts, NO se borra: es el runbook
// reversible para reactivar VOD si algún día se descongela).
export const NAV_SEG_IDS = ['home', 'buscar', 'reservas', 'perfil'] as const;
export type NavSegId = (typeof NAV_SEG_IDS)[number];

export interface NavItemDefault {
  seg: NavSegId;
  label: string;
  /** Nombre de lucide-react, nunca el componente (módulo puro). */
  icono: string;
}

// Catálogo y orden de pestañas del portal — mismas 4 que portal-shell.tsx.
export const NAV_DEFAULT: NavItemDefault[] = [
  { seg: 'home', label: 'Hoy', icono: 'Home' },
  { seg: 'buscar', label: 'Horario', icono: 'Search' },
  { seg: 'reservas', label: 'Reservas', icono: 'CalendarDays' },
  { seg: 'perfil', label: 'Perfil', icono: 'User' },
];

// Base sobre la que se aplican ocultar/renombrar. Fuente única para
// portal-shell.tsx (el armazón real) y theme-editor.tsx (el editor), para
// que nunca diverjan. El filtro por PORTAL_VIDEOS_CONGELADO ya no tiene
// ningún `seg` que excluir (no queda ninguna pestaña 'videos' en el
// catálogo) — se deja tal cual, sin tocar el flag ni su lógica, porque
// ambos siguen siendo el runbook real para reactivar VOD en otra pantalla.
export const NAV_DISPONIBLES: NavItemDefault[] = PORTAL_VIDEOS_CONGELADO
  ? NAV_DEFAULT.filter((n) => (n.seg as string) !== 'videos')
  : NAV_DEFAULT;

// Catálogo curado de iconos elegibles por pestaña — mismo criterio que
// BLOCK_CATALOG en portal-home-bloques.ts: una lista cerrada y segura, no un
// nombre de icono libre.
// 'Pilates' no es de Lucide: viene del set gratuito Guidance de Streamline
// (components/icons/pilates-icon.tsx), adaptado a la métrica de la familia.
// Se AÑADE sin quitar 'Dumbbell': los ids de este catálogo se persisten en la
// config del tema y retirar uno rompería estudios que ya lo eligieron.
export const NAV_ICONOS_DISPONIBLES = [
  'Home', 'CalendarDays', 'Ticket', 'Video', 'User', 'Star', 'Heart', 'Bell',
  'MessageCircle', 'Sparkles', 'MapPin', 'Dumbbell', 'Pilates', 'Search',
] as const;
export type NavIconoId = (typeof NAV_ICONOS_DISPONIBLES)[number];

export interface NavConfigShape {
  ocultos: NavSegId[];
  etiquetas: Partial<Record<NavSegId, string>>;
  iconos: Partial<Record<NavSegId, NavIconoId>>;
}

export const DEFAULT_NAV_CONFIG: NavConfigShape = { ocultos: [], etiquetas: {}, iconos: {} };

// Ids retirados en la reconstrucción → id nuevo que hereda su personalización
// ('videos' no tiene heredero: se pierde, coherente con que la pestaña entera
// desaparece del catálogo). Sin este mapeo, un estudio con `ocultos: ['bonos']`
// guardado de antes vería esa personalización descartada en silencio al pasar
// por el enum nuevo — y en theme-schema.ts (navConfigSchema) sería peor: un
// solo id desconocido invalida el objeto `ocultos` ENTERO, no solo ese id.
const MIGRACION_SEG_LEGACY: Record<string, NavSegId | null> = {
  clases: 'reservas',
  bonos: 'reservas',
  videos: null,
};

function migrarSegLegacy(seg: unknown): NavSegId | null {
  if (typeof seg !== 'string') return null;
  if ((NAV_SEG_IDS as readonly string[]).includes(seg)) return seg as NavSegId;
  return MIGRACION_SEG_LEGACY[seg] ?? null;
}

/**
 * Reescribe un NavConfigShape crudo (posiblemente con ids retirados antes de
 * la reconstrucción "Tentare Studio App") a los ids vigentes, ANTES de
 * validar/filtrar. La llaman tanto `resolveNavConfig` de aquí como
 * `resolveTheme` (`lib/theme-schema.ts`, campo `navPortal`) — ningún camino
 * de lectura debe perder personalización guardada por un id huérfano.
 */
export function migrarNavConfigRaw(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const obj = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...obj };

  if (Array.isArray(obj.ocultos)) {
    const migrados = new Set<NavSegId>();
    for (const s of obj.ocultos) {
      const nuevo = migrarSegLegacy(s);
      if (nuevo) migrados.add(nuevo);
    }
    out.ocultos = Array.from(migrados);
  }

  for (const campo of ['etiquetas', 'iconos'] as const) {
    const valorCampo = obj[campo];
    if (valorCampo && typeof valorCampo === 'object') {
      const nuevoCampo: Record<string, unknown> = {};
      for (const [seg, valor] of Object.entries(valorCampo as Record<string, unknown>)) {
        const nuevoSeg = migrarSegLegacy(seg);
        // Un id legacy fusionado (clases/bonos→reservas) puede chocar con
        // otro ya migrado al mismo destino: gana el PRIMERO en aparecer en el
        // objeto original, nunca el último machacando en silencio.
        if (nuevoSeg && !(nuevoSeg in nuevoCampo)) nuevoCampo[nuevoSeg] = valor;
      }
      out[campo] = nuevoCampo;
    }
  }

  return out;
}

/**
 * Fallback robusto: cualquier valor crudo → NavConfigShape válido, nunca
 * lanza (mismo principio que resolveTheme/resolveBloquesPantalla). `home`
 * nunca puede quedar oculta — es el destino de login/redirect del portal
 * (ver portal-shell.tsx) — si viene en `ocultos` se descarta en silencio en
 * vez de producir una app sin forma de volver a Inicio.
 */
export function resolveNavConfig(raw: unknown): NavConfigShape {
  const migrado = migrarNavConfigRaw(raw);
  const obj = migrado && typeof migrado === 'object' ? (migrado as Record<string, unknown>) : {};
  const segsValidos = new Set<string>(NAV_SEG_IDS);
  const iconosValidos = new Set<string>(NAV_ICONOS_DISPONIBLES);

  const ocultos = Array.isArray(obj.ocultos)
    ? (obj.ocultos as unknown[]).filter((s): s is NavSegId => typeof s === 'string' && s !== 'home' && segsValidos.has(s))
    : [];

  const etiquetas: Partial<Record<NavSegId, string>> = {};
  if (obj.etiquetas && typeof obj.etiquetas === 'object') {
    for (const [seg, valor] of Object.entries(obj.etiquetas as Record<string, unknown>)) {
      if (segsValidos.has(seg) && typeof valor === 'string' && valor.trim()) etiquetas[seg as NavSegId] = valor.trim();
    }
  }

  const iconos: Partial<Record<NavSegId, NavIconoId>> = {};
  if (obj.iconos && typeof obj.iconos === 'object') {
    for (const [seg, valor] of Object.entries(obj.iconos as Record<string, unknown>)) {
      if (segsValidos.has(seg) && typeof valor === 'string' && iconosValidos.has(valor)) iconos[seg as NavSegId] = valor as NavIconoId;
    }
  }

  return { ocultos, etiquetas, iconos };
}

/**
 * Pestañas resueltas para pintar: `disponibles` (por defecto, el catálogo
 * completo) menos las ocultas, con etiqueta/icono ya sustituidos donde
 * aplique. `disponibles` lo pasa el llamante ya filtrado por feature-freeze
 * (portal-shell.tsx) o por lo que quiera previsualizar (theme-editor.tsx).
 */
export function navItemsVisibles(config: NavConfigShape, disponibles: NavItemDefault[] = NAV_DEFAULT): NavItemDefault[] {
  return disponibles
    .filter((item) => !config.ocultos.includes(item.seg))
    .map((item) => ({
      seg: item.seg,
      label: config.etiquetas[item.seg] ?? item.label,
      icono: config.iconos[item.seg] ?? item.icono,
    }));
}

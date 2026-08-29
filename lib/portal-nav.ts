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

export const NAV_SEG_IDS = ['home', 'clases', 'reservas', 'videos', 'perfil'] as const;
export type NavSegId = (typeof NAV_SEG_IDS)[number];

export interface NavItemDefault {
  seg: NavSegId;
  label: string;
  /** Nombre de lucide-react, nunca el componente (módulo puro). */
  icono: string;
}

// Catálogo y orden de pestañas del portal — mismos 5 que portal-shell.tsx.
// `videos` puede no llegar nunca a mostrarse por el feature-freeze
// (PORTAL_VIDEOS_CONGELADO); eso se filtra en portal-shell.tsx ANTES de
// aplicar esta config, no aquí.
//
// Hoy/Horario/Reservas/Perfil — el menú literal de "Tentare Studio App"
// (Fase 1 de la sustitución de Oliva/Bloom/Noir por el diseño único). La
// pestaña `bonos` de antes desaparece del menú (el bono sigue accesible
// desde "Tu ritmo" en Hoy, que enlaza a /bonos); `reservas` es una pestaña
// NUEVA — mismo destino que ya usaba el CTA de "Ver mi acceso" en Hoy.
export const NAV_DEFAULT: NavItemDefault[] = [
  { seg: 'home', label: 'Hoy', icono: 'Home' },
  { seg: 'clases', label: 'Horario', icono: 'CalendarDays' },
  { seg: 'reservas', label: 'Reservas', icono: 'Ticket' },
  { seg: 'videos', label: 'Vídeos', icono: 'Video' },
  { seg: 'perfil', label: 'Perfil', icono: 'User' },
];

// Pestañas que existen de verdad hoy, después del feature-freeze (VOD
// congelado excluye "Vídeos" — PORTAL_VIDEOS_CONGELADO) — la base sobre la
// que se aplican ocultar/renombrar. Fuente única para portal-shell.tsx (el
// armazón real) y theme-editor.tsx (el editor), para que nunca diverjan.
export const NAV_DISPONIBLES: NavItemDefault[] = PORTAL_VIDEOS_CONGELADO
  ? NAV_DEFAULT.filter((n) => n.seg !== 'videos')
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
  'MessageCircle', 'Sparkles', 'MapPin', 'Dumbbell', 'Pilates',
] as const;
export type NavIconoId = (typeof NAV_ICONOS_DISPONIBLES)[number];

export interface NavConfigShape {
  ocultos: NavSegId[];
  etiquetas: Partial<Record<NavSegId, string>>;
  iconos: Partial<Record<NavSegId, NavIconoId>>;
}

export const DEFAULT_NAV_CONFIG: NavConfigShape = { ocultos: [], etiquetas: {}, iconos: {} };

/**
 * Fallback robusto: cualquier valor crudo → NavConfigShape válido, nunca
 * lanza (mismo principio que resolveTheme/resolveBloquesPantalla). `home`
 * nunca puede quedar oculta — es el destino de login/redirect del portal
 * (ver portal-shell.tsx) — si viene en `ocultos` se descarta en silencio en
 * vez de producir una app sin forma de volver a Inicio.
 */
export function resolveNavConfig(raw: unknown): NavConfigShape {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
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

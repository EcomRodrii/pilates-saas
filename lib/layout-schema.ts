// ═══════════════════════════════════════════════════════════════════════════
// Esquema de configuración del menú por estudio (Fase 4 · white-label)
// ═══════════════════════════════════════════════════════════════════════════
//
// Forma persistida en studio_layout.config. Puro (sin importar la config de
// navegación con iconos) para poder testearse en node y usarse en cliente.

import { z } from 'zod';

export const MENU_POSICIONES = ['lateral', 'superior'] as const;
export type MenuPosicion = (typeof MENU_POSICIONES)[number];

// Orden/visibilidad de un conjunto de elementos (menú o secciones de la home).
export interface OrdenVisibilidad {
  orden: string[];
  ocultos: string[];
}

export const layoutConfigSchema = z
  .object({
    // hrefs en el orden elegido; los módulos no listados van después, en su
    // orden por defecto.
    orden: z.array(z.string()),
    // hrefs ocultos del menú.
    ocultos: z.array(z.string()),
    menuPosition: z.enum(MENU_POSICIONES),
    // Orden/visibilidad de las secciones de la home del dashboard.
    home: z.object({ orden: z.array(z.string()), ocultos: z.array(z.string()) }),
  })
  .strict();

export type LayoutConfig = z.infer<typeof layoutConfigSchema>;

export const layoutDraftSchema = layoutConfigSchema.partial();
export type LayoutDraft = z.infer<typeof layoutDraftSchema>;

export const DEFAULT_LAYOUT: LayoutConfig = {
  orden: [],
  ocultos: [],
  menuPosition: 'lateral',
  home: { orden: [], ocultos: [] },
};

function resolveOrdenVis(raw: unknown): OrdenVisibilidad {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    orden: Array.isArray(obj.orden) ? obj.orden.filter((x): x is string => typeof x === 'string') : [],
    ocultos: Array.isArray(obj.ocultos) ? obj.ocultos.filter((x): x is string => typeof x === 'string') : [],
  };
}

/** Fallback robusto: cualquier valor crudo → LayoutConfig válido completo. */
export function resolveLayout(raw: unknown): LayoutConfig {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const { orden, ocultos } = resolveOrdenVis(obj);
  const menuPosition = (MENU_POSICIONES as readonly string[]).includes(obj.menuPosition as string)
    ? (obj.menuPosition as MenuPosicion)
    : 'lateral';
  return { orden, ocultos, menuPosition, home: resolveOrdenVis(obj.home) };
}

/**
 * Aplica una config de orden/visibilidad a la lista canónica de ids: devuelve
 * los visibles en el orden final (orden elegido primero, luego el resto en su
 * orden original; los ocultos fuera). `todos` es la lista por defecto.
 */
export function aplicarLayout(todos: string[], cfg: OrdenVisibilidad): string[] {
  const ocultos = new Set(cfg.ocultos);
  const existentes = new Set(todos);
  // Orden elegido, filtrando hrefs que ya no existen.
  const ordenados = cfg.orden.filter((h) => existentes.has(h));
  const enOrden = new Set(ordenados);
  // Módulos no mencionados en `orden`, en su orden natural.
  const resto = todos.filter((h) => !enOrden.has(h));
  return [...ordenados, ...resto].filter((h) => !ocultos.has(h));
}

// ═══════════════════════════════════════════════════════════════════════════
// Esquema de configuración del menú por estudio (Fase 4 · white-label)
// ═══════════════════════════════════════════════════════════════════════════
//
// Forma persistida en studio_layout.config. Puro (sin importar la config de
// navegación con iconos) para poder testearse en node y usarse en cliente.

import { z } from 'zod';
import {
  MENU_POSICIONES, type MenuPosicion, type OrdenVisibilidad,
  DEFAULT_LAYOUT, resolveLayout, aplicarLayout,
} from './layout-runtime.ts';

// Piezas puras (sin zod) reexportadas desde layout-runtime.ts por
// compatibilidad — los módulos de CLIENTE (dashboard/page.tsx) importan de ahí
// directamente para no arrastrar zod a su bundle.
export { MENU_POSICIONES, DEFAULT_LAYOUT, resolveLayout, aplicarLayout };
export type { MenuPosicion, OrdenVisibilidad };

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

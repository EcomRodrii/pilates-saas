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
import { BLOQUES_SISTEMA_IDS, DEFAULT_HOME_BLOQUES_SHAPE, type BloqueHome } from './portal-home-bloques.ts';

// Piezas puras (sin zod) reexportadas desde layout-runtime.ts por
// compatibilidad — los módulos de CLIENTE (dashboard/page.tsx) importan de ahí
// directamente para no arrastrar zod a su bundle.
export { MENU_POSICIONES, DEFAULT_LAYOUT, resolveLayout, aplicarLayout };
export type { MenuPosicion, OrdenVisibilidad };

// Un `href` (banner/CTA) nunca se valida como URL estricta aquí — un enlace
// interno es una ruta ("/reservar"), no una URL. El filtro real de enlaces
// externos peligrosos (`javascript:`, `data:`…) vive en el RENDER
// (hrefExternoSeguro, app/portal/[slug]/home/page.tsx), no en el guardado:
// el dato tiene que poder guardarse tal cual lo escribió el estudio para
// poder editarlo después, aunque todavía no sea válido a medio escribir.
export const bloqueHomeSchema: z.ZodType<BloqueHome> = z.discriminatedUnion('kind', [
  z.object({ id: z.string(), kind: z.literal('sistema'), sistemaId: z.enum(BLOQUES_SISTEMA_IDS), oculto: z.boolean().optional() }),
  z.object({
    id: z.string(), kind: z.literal('banner'), oculto: z.boolean().optional(),
    config: z.object({ imagenUrl: z.string(), titulo: z.string(), texto: z.string(), href: z.string() }),
  }),
  z.object({
    id: z.string(), kind: z.literal('texto'), oculto: z.boolean().optional(),
    config: z.object({ titulo: z.string(), texto: z.string() }),
  }),
  z.object({
    id: z.string(), kind: z.literal('cta'), oculto: z.boolean().optional(),
    config: z.object({ titulo: z.string(), textoBoton: z.string(), href: z.string() }),
  }),
  z.object({
    id: z.string(), kind: z.literal('faq'), oculto: z.boolean().optional(),
    config: z.object({
      titulo: z.string(),
      preguntas: z.array(z.object({ pregunta: z.string(), respuesta: z.string() })),
    }),
  }),
]);

const homeBloquesSchema = z
  .object({ draft: z.array(bloqueHomeSchema), publicado: z.array(bloqueHomeSchema) })
  .default(DEFAULT_HOME_BLOQUES_SHAPE);

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
    // Orden/visibilidad de los módulos de Inicio del PORTAL cliente (Fase 2) —
    // legacy, ver resolveHomeBloques(): se lee como fallback cuando
    // `homeBloques` está vacío, pero deja de ser la fuente de verdad en
    // cuanto el estudio guarda un borrador con el sistema de bloques.
    portalHome: z.object({ orden: z.array(z.string()), ocultos: z.array(z.string()) }),
    // Constructor de bloques del Inicio del portal (Fase 3). Con
    // draft/publish PROPIO (a diferencia del resto de este esquema, que se
    // aplica en vivo — ver comentario en migración 0020): aquí sí hay
    // contenido editorial real (texto, imagen, preguntas) que un cambio a
    // medias no debe publicar solo.
    homeBloques: homeBloquesSchema,
  })
  .strict();

export type LayoutConfig = z.infer<typeof layoutConfigSchema>;

export const layoutDraftSchema = layoutConfigSchema.partial();
export type LayoutDraft = z.infer<typeof layoutDraftSchema>;

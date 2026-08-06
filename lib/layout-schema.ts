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
import {
  BLOQUES_SISTEMA_IDS, DEFAULT_BLOQUES_SHAPE, REGISTRO_BLOQUES, CAMPOS_ESTILO, type BloqueHome,
} from './portal-home-bloques.ts';
import { zodDeBloques } from './theme/campos-zod.ts';

// Piezas puras (sin zod) reexportadas desde layout-runtime.ts por
// compatibilidad — los módulos de CLIENTE (dashboard/page.tsx) importan de ahí
// directamente para no arrastrar zod a su bundle.
export { MENU_POSICIONES, DEFAULT_LAYOUT, resolveLayout, aplicarLayout };
export type { MenuPosicion, OrdenVisibilidad };

// El validador de un bloque se DERIVA del registro (REGISTRO_BLOQUES), no se
// escribe. Antes era la cuarta copia de la misma forma — y la más peligrosa
// de las cuatro, porque su divergencia no se ve al revisar: un campo que
// falte aquí no da error, simplemente se PODA en el siguiente guardado y la
// propietaria pierde lo que había escrito.
//
// Se conservan los dos criterios que ya tenía escrito a mano, ahora en el
// generador (lib/theme/campos-zod.ts):
//  · un `href` (banner/CTA) NO se valida como URL estricta — un enlace
//    interno es una ruta ("/reservar"), no una URL, y el dato tiene que poder
//    guardarse tal cual lo escribió el estudio para poder editarlo después.
//    El filtro real de `javascript:`/`data:` vive en el RENDER.
//  · `fondo`/`color` tampoco se validan como hex estricto: a medio teclear un
//    color no es válido todavía. El render decide si lo aplica o hereda.
export const bloqueHomeSchema: z.ZodType<BloqueHome> = zodDeBloques(
  Object.values(REGISTRO_BLOQUES),
  BLOQUES_SISTEMA_IDS,
  CAMPOS_ESTILO,
) as z.ZodType<BloqueHome>;

const bloquesShapeSchema = z
  .object({ draft: z.array(bloqueHomeSchema), publicado: z.array(bloqueHomeSchema) })
  .default(DEFAULT_BLOQUES_SHAPE.home);

// Constructor de bloques (Fase 3, generalizado en la Fase 1 del Theme
// Builder): una entrada por pantalla del portal. Con draft/publish PROPIO
// (a diferencia del resto de este esquema, que se aplica en vivo — ver
// comentario en migración 0020): aquí sí hay contenido editorial real
// (texto, imagen, preguntas) que un cambio a medias no debe publicar solo.
// Objeto de claves fijas (no z.record): las tres pantallas del portal que
// tienen constructor de bloques hoy son una lista cerrada y conocida, igual
// que el resto de este esquema `.strict()` — dar de alta una pantalla nueva
// es añadir una clave aquí, no abrir el esquema a cualquier string.
const bloquesPorPantallaSchema = z
  .object({ home: bloquesShapeSchema, clases: bloquesShapeSchema, bonos: bloquesShapeSchema })
  .default(DEFAULT_BLOQUES_SHAPE);

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
    // legacy, ver resolveBloquesPantalla(): se lee como fallback cuando
    // `bloques.home` está vacío, pero deja de ser la fuente de verdad en
    // cuanto el estudio guarda un borrador con el sistema de bloques.
    portalHome: z.object({ orden: z.array(z.string()), ocultos: z.array(z.string()) }),
    bloques: bloquesPorPantallaSchema,
  })
  .strict();

export type LayoutConfig = z.infer<typeof layoutConfigSchema>;

export const layoutDraftSchema = layoutConfigSchema.partial();
export type LayoutDraft = z.infer<typeof layoutDraftSchema>;

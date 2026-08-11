// ═══════════════════════════════════════════════════════════════════════════
// Motor puro de orden/visibilidad del menú (Fase 4 · white-label)
// ═══════════════════════════════════════════════════════════════════════════
//
// Separado de layout-schema.ts (que valida con zod) para que el dashboard
// —la ruta más visitada del panel— pueda calcular qué secciones mostrar sin
// arrastrar zod a su bundle de cliente. Cero dependencias de validación
// (`portal-home-bloques.ts` es igual de puro, así que importarlo no rompe eso).

import {
  resolveBloquesPantalla, DEFAULT_BLOQUES_SHAPE, PANTALLA_IDS,
  type HomeBloquesShape, type BloquesPorPantallaShape,
} from './portal-home-bloques.ts';
export type { HomeBloquesShape, BloquesPorPantallaShape };
export { resolveBloquesPantalla };

export const MENU_POSICIONES = ['lateral', 'superior'] as const;
export type MenuPosicion = (typeof MENU_POSICIONES)[number];

// Orden/visibilidad de un conjunto de elementos (menú o secciones de la home).
export interface OrdenVisibilidad {
  orden: string[];
  ocultos: string[];
}

export interface LayoutConfigShape {
  orden: string[];
  ocultos: string[];
  menuPosition: MenuPosicion;
  home: OrdenVisibilidad;
  // Orden/visibilidad de los módulos de Inicio del PORTAL cliente (Fase 2 del
  // editor de temas) — distinto de `home`, que es la home del DASHBOARD.
  // Legacy desde Fase 3: ver bloques.home/resolveBloquesPantalla.
  portalHome: OrdenVisibilidad;
  // Orden/visibilidad de las secciones de /reservar — el widget que el estudio
  // incrusta en su web. Misma forma que `home`/`portalHome` a propósito: es el
  // mismo problema (un conjunto FIJO que se reordena y se oculta, no bloques
  // que se añaden), y darle forma propia sería un tercer dialecto para lo
  // mismo. Las reglas viven en lib/reservar/secciones.ts.
  reservar: OrdenVisibilidad;
  // Constructor de bloques (Fase 3, generalizado a Clases/Bonos en la Fase 1
  // del Theme Builder). El de Home sustituye a `portalHome` como fuente de
  // verdad en cuanto el estudio guarda un borrador ahí — hasta entonces,
  // `resolveBloquesPantalla` sintetiza `bloques.home` a partir de
  // `portalHome`. Clases/Bonos no tienen ese legado.
  bloques: BloquesPorPantallaShape;
}

export const DEFAULT_LAYOUT: LayoutConfigShape = {
  orden: [],
  ocultos: [],
  menuPosition: 'lateral',
  home: { orden: [], ocultos: [] },
  portalHome: { orden: [], ocultos: [] },
  reservar: { orden: [], ocultos: [] },
  bloques: DEFAULT_BLOQUES_SHAPE,
};

function resolveOrdenVis(raw: unknown): OrdenVisibilidad {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    orden: Array.isArray(obj.orden) ? obj.orden.filter((x): x is string => typeof x === 'string') : [],
    ocultos: Array.isArray(obj.ocultos) ? obj.ocultos.filter((x): x is string => typeof x === 'string') : [],
  };
}

/** Fallback robusto: cualquier valor crudo → LayoutConfig válido completo. */
export function resolveLayout(raw: unknown): LayoutConfigShape {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const { orden, ocultos } = resolveOrdenVis(obj);
  const menuPosition = (MENU_POSICIONES as readonly string[]).includes(obj.menuPosition as string)
    ? (obj.menuPosition as MenuPosicion)
    : 'lateral';
  const portalHome = resolveOrdenVis(obj.portalHome);
  const bloquesRaw = obj.bloques && typeof obj.bloques === 'object' ? (obj.bloques as Record<string, unknown>) : {};
  const bloques = Object.fromEntries(
    PANTALLA_IDS.map((id) => [
      id,
      // `home` legacy: antes de esta fase se guardaba suelto en `homeBloques`,
      // no dentro de `bloques.home` — se sigue leyendo por compatibilidad.
      resolveBloquesPantalla(id === 'home' ? (bloquesRaw.home ?? obj.homeBloques) : bloquesRaw[id], id, id === 'home' ? portalHome : undefined),
    ]),
  ) as BloquesPorPantallaShape;
  return {
    orden, ocultos, menuPosition,
    home: resolveOrdenVis(obj.home),
    portalHome,
    reservar: resolveOrdenVis(obj.reservar),
    bloques,
  };
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

/**
 * Qué entradas del menú ve una persona concreta. Tres filtros encadenados, y
 * el orden entre ellos no importa porque todos son restrictivos:
 *
 *   · permiso   — su rol; lo decide el servidor, aquí solo se refleja.
 *   · ocultos   — módulos que el estudio ha decidido no usar.
 *   · esencial  — modo por defecto: solo el día a día, para que un estudio
 *                 nuevo no se ahogue. Se amplía con "Ver todo".
 *
 * Lo que NO hace: reordenar. El orden del menú es el mismo en todos los
 * estudios a propósito (principio 6), así que aquí solo se filtra.
 */
export function filtrarItemsMenu<T extends { href: string }>(
  items: T[],
  opts: {
    puedeVer: (href: string) => boolean;
    ocultos: Set<string> | string[];
    modo: 'esencial' | 'avanzado';
    esenciales: readonly string[];
  },
): T[] {
  const ocultos = opts.ocultos instanceof Set ? opts.ocultos : new Set(opts.ocultos);
  return items.filter(
    (i) =>
      opts.puedeVer(i.href) &&
      !ocultos.has(i.href) &&
      (opts.modo === 'avanzado' || opts.esenciales.includes(i.href)),
  );
}

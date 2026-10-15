// ─────────────────────────────────────────────────────────────────────────────
// Qué módulos están en el menú con el panel nuevo (15-oct-2026): la pantalla
// Módulos sustituye al conmutador «Esencial / Todo» del menú lateral, como en
// Bonsai, donde lo que está activo en Módulos es lo que sale en el menú, y
// nada más. Puro, sin `@/` (menu.test.ts).
//
// Antes había dos mandos para lo mismo: `ocultos` (del estudio, en Módulos y en
// «Tu menú») y «Esencial / Todo» (de cada navegador). Con el panel nuevo queda
// uno, del estudio:
//   · lo fijo (Resumen, Configuración, Suscripción y la propia Módulos) está
//     siempre;
//   · lo del día a día (ESSENTIAL_HREFS) está salvo que el estudio lo oculte;
//   · lo demás (Automatizaciones, Sustituciones, Caja, Cierre de año…) sale
//     solo si el estudio lo activa: se guarda en `activados`.
// Es lo que veía cualquier estudio con el menú de serie («Esencial»): nadie
// encuentra su menú cambiado el día que se le enciende el panel nuevo.
// ⚠️ Una sección nueva del menú que deba salir de serie va en ESSENTIAL_HREFS;
// si no, nace apagada y se activa en Módulos.
// ─────────────────────────────────────────────────────────────────────────────

import { ESSENTIAL_HREFS, NO_OCULTABLES } from '../nav-config.ts';

/** La pantalla Módulos (su ruta de siempre). Siempre en el menú: es donde se vuelve a activar todo. */
export const HREF_MODULOS = '/explorar-funciones';

export interface EleccionModulos {
  ocultos: readonly string[];
  activados: readonly string[];
}

/** Lo que no se puede quitar del menú. */
export function siempreEnElMenu(href: string): boolean {
  return NO_OCULTABLES.includes(href) || href === HREF_MODULOS;
}

/** ¿Está en el menú del estudio, con el panel nuevo? */
export function activoEnModulos(href: string, e: EleccionModulos): boolean {
  if (siempreEnElMenu(href)) return true;
  if (e.ocultos.includes(href)) return false;
  return ESSENTIAL_HREFS.includes(href) || e.activados.includes(href);
}

/**
 * Lo que se guarda al pulsar el interruptor de un módulo en Módulos (`null` si
 * es fijo). Va siempre en `ocultos` también, así que si el panel nuevo se
 * apagara, el menú de siempre respetaría lo que se ocultó aquí.
 */
export function eleccionTrasCambiar(e: EleccionModulos, href: string, activo: boolean): { ocultos: string[]; activados: string[] } | null {
  if (siempreEnElMenu(href)) return null;
  const ocultos = e.ocultos.filter((h) => h !== href);
  const activados = e.activados.filter((h) => h !== href);
  if (!activo) return { ocultos: [...ocultos, href], activados };
  return { ocultos, activados: ESSENTIAL_HREFS.includes(href) ? activados : [...activados, href] };
}

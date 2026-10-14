// ─────────────────────────────────────────────────────────────────────────────
// Secciones del menú que SOLO existen con el panel nuevo (interruptor
// `PANEL_NUEVO`, 14-oct-2026). Hoy, ninguna: Festivos nació aquí y el mismo
// 14-oct pasó a todos los estudios (está en `allSections`). El mecanismo se
// queda para la próxima sección que salga primero en el estudio de prueba.
//
// Viven FUERA de `navSections`/`MODULOS` (lib/nav-config.ts) a propósito, como
// `/asistente`: de esos dos leen también el «Mapa de Tentare» del asistente (un
// prompt cacheado para TODOS los estudios: cambiarlo le hablaría de Festivos a
// quien no lo tiene y partiría la caché de todos), «Explorar funciones» y las
// novedades del menú. Las meten solo quienes pintan el menú de ESTE estudio, con
// `seccionesDelMenu(panelNuevo)`: el menú lateral, el ⌘K, «Tu menú», el título
// de la pestaña y Módulos. Con el interruptor apagado, nada cambia ni un píxel.
//
// Cuando el panel nuevo pase a todos, cada una se muda a `allSections` con su
// ficha de ayuda (lib/ayuda/pantallas.ts) y su línea en el mapa del asistente.
// Relativos y con extensión, como nav-config: lo prueba `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { navSections, type NavItemDef, type NavSection } from './nav-config.ts';

export interface SeccionPanelNuevo extends NavItemDef {
  /** El grupo del menú en el que va, al final. */
  grupo: 'Operación' | 'Equipo' | 'Negocio' | 'Estudio';
  /** La frase de su tarjeta en Módulos (la de las demás sale de su ficha de ayuda). */
  frase: string;
}

export const SECCIONES_PANEL_NUEVO: readonly SeccionPanelNuevo[] = [];

/** ¿Es una de estas secciones? (para el icono de color de su cabecera y su frase en Módulos). */
export function seccionPanelNuevo(href: string): SeccionPanelNuevo | null {
  return SECCIONES_PANEL_NUEVO.find((s) => s.href === href) ?? null;
}

/** El menú de este estudio: el de siempre y, con el panel nuevo, sus secciones al final de su grupo. */
export function seccionesDelMenu(panelNuevo: boolean): NavSection[] {
  if (!panelNuevo) return navSections;
  return navSections.map((s) => {
    const extra = SECCIONES_PANEL_NUEVO.filter((x) => x.grupo === s.label);
    return extra.length ? { ...s, items: [...s.items, ...extra] } : s;
  });
}

/** Lo mismo, en lista plana (el ⌘K). */
export function modulosDelMenu(panelNuevo: boolean): NavItemDef[] {
  return seccionesDelMenu(panelNuevo).flatMap((s) => s.items);
}

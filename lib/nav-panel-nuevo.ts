// ─────────────────────────────────────────────────────────────────────────────
// Secciones del menú que SOLO existen con el panel nuevo (interruptor
// `PANEL_NUEVO`, 14-oct-2026). Hoy, Módulos (15-oct): como en Bonsai, es una
// entrada del menú, y sustituye al conmutador «Esencial / Todo», que con el
// panel nuevo no se pinta (lib/modulos/menu.ts). Festivos nació aquí y el mismo
// 14-oct pasó a todos los estudios (está en `allSections`).
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

import { Globe, LayoutGrid, Smartphone } from 'lucide-react';
import { navSections, type NavItemDef, type NavSection } from './nav-config.ts';

export interface SeccionPanelNuevo extends NavItemDef {
  /** El grupo del menú en el que va, al final. */
  grupo: 'Operación' | 'Equipo' | 'Negocio' | 'Estudio' | typeof GRUPO_TE_VEN;
  /** La frase de su tarjeta en Módulos (la de las demás sale de su ficha de ayuda). */
  frase: string;
}

export const SECCIONES_PANEL_NUEVO: readonly SeccionPanelNuevo[] = [
  // Su ruta de siempre (/explorar-funciones), que con el panel nuevo ya pinta
  // Módulos: así los enlaces que había (Primeros pasos, el menú de perfil) llevan
  // al mismo sitio. Siempre en el menú (`siempreEnElMenu`).
  {
    href: '/explorar-funciones', label: 'Módulos', icon: LayoutGrid, grupo: 'Estudio',
    alias: ['modulos', 'explorar funciones', 'funciones', 'activar', 'ocultar del menu', 'esencial', 'todo el menu'],
    frase: 'Qué sale en tu menú: activa los módulos que usas y oculta los que no, sin borrar nada.',
  },
];

// ─── «Tu app» y «Tu web» (interruptor `MI_WEB_NUEVA`, 16-oct-2026) ──────────
// Maqueta aprobada por el fundador: la app de la alumna y los widgets de su web
// son DOS cosas y dos entradas del menú, cada una un módulo propio («App alumna y
// widget separado en módulos»), en un grupo que dice para qué son. «Tu app» abre
// el editor de siempre (el de Bonsai, que no se toca); «Tu web», los widgets.
// Solo con el panel nuevo, como el resto de este fichero.
export const GRUPO_TE_VEN = 'Tus alumnas te ven en';

export const SECCIONES_MI_WEB_NUEVA: readonly SeccionPanelNuevo[] = [
  {
    href: '/tu-app', label: 'Tu app', icon: Smartphone, grupo: GRUPO_TE_VEN,
    alias: ['apariencia', 'app alumna', 'app de la alumna', 'aplicacion', 'app store', 'mi app', 'contenido de tu app', 'marca'],
    frase: 'La app de tus alumnas: cómo se ve, qué enseña y dónde se descarga (también en la App Store).',
  },
  {
    href: '/tu-web', label: 'Tu web', icon: Globe, grupo: GRUPO_TE_VEN,
    alias: ['widgets', 'widget', 'mi web', 'pagina web', 'horario en mi web', 'wordpress', 'wix', 'squarespace', 'codigo'],
    frase: 'Tu horario, tus precios y tu alta dentro de tu propia página web.',
  },
];

/** ¿Es una de estas secciones? (para el icono de color de su cabecera y su frase en Módulos). */
export function seccionPanelNuevo(href: string): SeccionPanelNuevo | null {
  return [...SECCIONES_PANEL_NUEVO, ...SECCIONES_MI_WEB_NUEVA].find((s) => s.href === href) ?? null;
}

/**
 * El menú de este estudio: el de siempre y, con el panel nuevo, sus secciones al final de su grupo.
 * Con `MI_WEB_NUEVA` (y el panel nuevo), además el grupo «Tus alumnas te ven en», justo antes de «Estudio».
 */
export function seccionesDelMenu(panelNuevo: boolean, miWebNueva = false): NavSection[] {
  if (!panelNuevo) return navSections;
  const conExtras = navSections.map((s) => {
    const extra = SECCIONES_PANEL_NUEVO.filter((x) => x.grupo === s.label);
    return extra.length ? { ...s, items: [...s.items, ...extra] } : s;
  });
  if (!miWebNueva) return conExtras;
  const grupo: NavSection = { label: GRUPO_TE_VEN, items: [...SECCIONES_MI_WEB_NUEVA] };
  const estudio = conExtras.findIndex((s) => s.label === 'Estudio');
  return estudio < 0 ? [...conExtras, grupo] : [...conExtras.slice(0, estudio), grupo, ...conExtras.slice(estudio)];
}

/** Lo mismo, en lista plana (el ⌘K). */
export function modulosDelMenu(panelNuevo: boolean, miWebNueva = false): NavItemDef[] {
  return seccionesDelMenu(panelNuevo, miWebNueva).flatMap((s) => s.items);
}

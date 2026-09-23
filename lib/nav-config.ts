// Config de navegación del panel — fuente única compartida por el sidebar y el
// editor de menú (Fase 4). Extraído de components/layout/sidebar.tsx.

import {
  LayoutDashboard, Calendar, Users, CreditCard,
  Settings, BarChart3,
  Clock, Megaphone, Play,
  Bot, Package, Store, Inbox,
  UserCog, Users2, Compass, Replace, Network,
  Calculator, Notebook, DownloadCloud, Wallet,
} from 'lucide-react';
// Relativos y con extensión: `npm test` corre `node --test
// --experimental-strip-types`, que no resuelve ni el alias `@/` ni las
// extensiones. Sin esto, el menú se queda otra vez sin poder probarse.
import { MARKETING_MODULE_ENABLED } from './feature-flags.ts';
import { esRutaCongelada } from './frozen-features.ts';

export interface NavItemDef {
  href: string;
  label: string;
  icon: React.ElementType;
  /**
   * Otros nombres por los que el ⌘K debe encontrar esta sección.
   *
   * El buscador casa solo contra `label`, así que RENOMBRAR una sección la
   * hace inencontrable por su nombre viejo — y quien lleva meses usando
   * Tentare busca por el nombre que aprendió, no por el nuevo. Aquí van esos
   * nombres, en minúsculas y sin tildes (`normalizar` ya las quita).
   */
  alias?: string[];
}
export interface NavSection {
  label?: string;
  items: NavItemDef[];
}

// ─── Jerarquía del menú (reorganización 2026-09-14) ─────────────────────────
// Se ordena por la pregunta que se viene a contestar, no por el objeto que se
// toca:
//   · arriba, sin rótulo: dónde se entra (Resumen), el cerebro (Centro de
//     Control) y lo que trabaja solo (Automatizaciones);
//   · Operación: lo de todos los días — clases, citas, alumnas, mensajes;
//   · Equipo: quién da las clases y qué pasa cuando alguien no puede;
//   · Negocio: dinero y resultados;
//   · Estudio: ajustes y cosas que se tocan una vez.
// Antes «Estudio» mezclaba once entradas —equipo, informes, cierre fiscal,
// ajustes, changelog y la suscripción a Tentare— y Automatizaciones colgaba
// sola entre Dashboard y Marketing. Ninguna ruta, permiso ni pantalla cambia:
// solo el sitio en el menú. El orden que cada estudio haya guardado a mano
// (`ordenarItemsMenu`) se sigue respetando dentro de cada grupo.
const allSections: NavSection[] = [
  // «Resumen» y no «Inicio» ni «Dashboard» (23-sep): el nombre dice lo que hay
  // dentro —el día resumido— en vez de dónde estás, que ya lo dice el propio
  // menú. Escritorio y móvil la llaman igual: la misma pantalla con dos
  // nombres según el dispositivo obligaba a aprender dos. «inicio» sigue en
  // los alias para que el ⌘K la encuentre por el nombre viejo. Va la primera
  // porque es la única entrada que ven todos los roles y todos los planes; el
  // Centro de Control, justo detrás, es solo de la propietaria y depende del
  // plan.
  { items: [{ href: '/dashboard', label: 'Resumen', icon: LayoutDashboard, alias: ['inicio', 'dashboard', 'panel', 'hoy'] }] },
  { items: [{ href: '/centro-de-control', label: 'Centro de Control', icon: Compass }] },
  // P2 (auditoría de producto): decía "Automatizaciones IA" — contradice la
  // decisión de marca de usar "automático", ya aplicada al copy de
  // marketing/landing pero no propagada al panel. Sin rótulo de grupo propio:
  // una sección de un solo elemento es ruido.
  { items: [{ href: '/automatizaciones', label: 'Automatizaciones', icon: Bot }] },
  {
    label: 'Operación',
    items: [
      { href: '/calendario', label: 'Calendario', icon: Calendar },
      { href: '/citas', label: 'Citas', icon: Clock },
      { href: '/clientas', label: 'Clientas', icon: Users },
      // «Comunidad» ya no tiene entrada propia: /comunidad pintaba el MISMO
      // `ComunidadFeed` que la pestaña Comunidad de Mensajería, así que eran
      // dos entradas de menú para una sola pantalla. La ruta sigue viva (hay
      // enlaces y e2e que la usan); el ⌘K la encuentra por aquí.
      { href: '/mensajeria', label: 'Mensajería', icon: Inbox, alias: ['comunidad', 'tablon', 'mensajes', 'conversaciones'] },
    ],
  },
  {
    label: 'Equipo',
    items: [
      { href: '/equipo', label: 'Equipo', icon: UserCog },
      // Sustituciones vive junto a Tentare Network (P1 de la auditoría
      // 2026-08-25, "unificar sustituciones"): las dos resuelven la misma
      // pregunta —"necesito a alguien"— solo que una busca dentro (candidatas
      // ya conocidas del estudio) y la otra fuera (marketplace). Fusión
      // deliberadamente SOLO visual: la ruta, los permisos y el motor de
      // sustituciones (que ya distingue candidatas internas de las de Network
      // sin fusionar sus rankings, ver lib/network/candidatos-sustitucion.ts)
      // no se tocan.
      { href: '/sustituciones', label: 'Sustituciones', icon: Replace },
      // Buscador de candidatas de Tentare Network — herramienta de
      // contratación de la propietaria/manager/recepción, NO donde una
      // instructora gestiona su propio perfil (eso se mudó fuera del panel,
      // a app/network/mi-perfil — cuenta independiente, sin studio_id). Por
      // eso ya no está en PERMITIDO_INSTRUCTOR (lib/permisos-reglas.ts).
      // /network/buscar y no /network: esa URL literal la ocupa ahora la
      // landing PÚBLICA de Network (app/network/page.tsx, rediseño 2026-08) —
      // no puede haber dos páginas en la misma ruta.
      // Label "Tentare Network" (no "Buscar instructoras"): desde Fase 2
      // esta ruta abre una sección con su propio sub-nav
      // (app/(dashboard)/network/layout.tsx: Buscar/Favoritas/Mensajes), no
      // una sola pantalla — el sidebar general solo necesita apuntar a la
      // entrada, la separación real la da ese sub-nav.
      { href: '/network/buscar', label: 'Tentare Network', icon: Network },
      { href: '/chat', label: 'Chat de equipo', icon: Users2 },
    ],
  },
  {
    label: 'Negocio',
    items: [
      // "Cobros" reúne pendientes, facturas y movimientos: antes eran tres
      // entradas distintas para la misma pregunta ("¿quién me debe y cuánto ha
      // entrado?"). La caja se llama Caja y no POS porque es la palabra que se
      // usa en el mostrador.
      { href: '/cobros', label: 'Cobros', icon: CreditCard },
      { href: '/pos', label: 'Caja', icon: Store },
      { href: '/productos', label: 'Paquetes', icon: Package, alias: ['membresias', 'planes', 'tarifas', 'bonos'] },
      { href: '/informes', label: 'Informes', icon: BarChart3 },
      // Junto a Cobros e Informes y no entre los ajustes: es el total
      // facturado y el IVA del año para la gestoría — dinero, no configuración.
      { href: '/cierre', label: 'Cierre de año', icon: Calculator },
      // Contenido (redes) y Marketing (campañas/automatizaciones/Klaviyo) eran
      // dos promesas de producto separadas en el menú. Ya no es una sección con
      // 8 entradas — un solo enlace, /marketing, con las pantallas de contenido
      // (calendario/biblioteca/ideas/métricas) alcanzables en un clic desde ahí
      // mismo (pestaña "Contenido" dentro de la página, que enlaza al hub
      // /contenido, que a su vez enlaza al resto — ver ACCESOS en
      // app/(dashboard)/contenido/page.tsx).
      { href: '/marketing', label: 'Marketing', icon: Megaphone },
      { href: '/ondemand', label: 'Oferta digital', icon: Play },
    ],
  },
  {
    label: 'Estudio',
    items: [
      { href: '/configuracion', label: 'Configuración', icon: Settings },
      // La pantalla existía pero no había forma de llegar a ella: había que
      // saberse la URL. Se llama "Traer mis datos" y no "Migración" porque nadie
      // que viene de otra app piensa en migrar, piensa en traerse lo suyo.
      { href: '/migracion', label: 'Traer mis datos', icon: DownloadCloud },
      { href: '/libreta', label: 'Libreta de clientas', icon: Notebook },
      { href: '/actualizaciones', label: 'Actualizaciones', icon: Megaphone, alias: ['novedades', 'changelog', 'versiones', 'que hay de nuevo'] },
      // Wallet y no CreditCard: CreditCard ya es /cobros (dinero de las socias)
      // y repetirlo aquí hacía indistinguibles dos conceptos opuestos — cobrar
      // tú vs pagar tu cuota de Tentare (auditoría 2026-08-20).
      { href: '/suscripcion', label: 'Suscripción', icon: Wallet },
    ],
  },
];

// Interruptor temporal: oculta /marketing (contenido de redes +
// campañas/automatizaciones/Klaviyo, alcanzables todas desde ese único
// enlace — ver arriba) del menú. El código sigue en el repo; para
// reactivar, poner MARKETING_MODULE_ENABLED a true en
// lib/feature-flags.ts. /ondemand queda aparte a propósito: lo congela
// lib/frozen-features.ts (feature-freeze PMF), no este flag — filtrarlo
// aquí también es defensivo, no la fuente de verdad.
const OCULTOS_MARKETING = ['/marketing', '/ondemand'];
const conMarketing: NavSection[] = MARKETING_MODULE_ENABLED
  ? allSections
  : allSections
      .map((s) => ({ ...s, items: s.items.filter((i) => !OCULTOS_MARKETING.includes(i.href)) }));

// Feature-freeze PMF: saca los módulos congelados (/ondemand, /chat) del menú y
// de TODO lo que deriva de él —editor de menú, buscador ⌘K, MODULOS—, con
// independencia del flag de marketing, y elimina las secciones que quedan
// vacías. Reactivar = quitar la ruta de RUTAS_CONGELADAS en lib/frozen-features.ts.
export const navSections: NavSection[] = conMarketing
  .map((s) => ({ ...s, items: s.items.filter((i) => !esRutaCongelada(i.href)) }))
  .filter((s) => s.items.length > 0);

// Lista plana de todos los módulos, en orden natural.
export const MODULOS: NavItemDef[] = navSections.flatMap((s) => s.items);

export const bottomNavItems: NavItemDef[] = [
  { href: '/dashboard', label: 'Resumen', icon: LayoutDashboard },
  { href: '/calendario', label: 'Clases', icon: Calendar },
  { href: '/clientas', label: 'Clientas', icon: Users },
  { href: '/cobros', label: 'Cobros', icon: CreditCard },
];

// Modo Esencial: módulos del día a día (preferencia de UI por-navegador).
//
// `/migracion` entra aquí aunque se use UNA vez, y a propósito: el modo por
// defecto es «esencial», así que dejarlo fuera lo escondería justo del estudio
// que lo necesita —uno recién creado, el día que trae sus datos de BSport o
// Momence—. La contrapartida (una entrada de más para quien ya migró) tiene
// salida: no está en NO_OCULTABLES, así que se puede quitar desde el editor de
// menú. Al revés no la habría: no se puede encontrar lo que no se ve.
// '/productos' (Paquetes) entra el 13-sep: las tarifas dejaron de estar en
// Configuración, y «Esencial» es el modo por defecto — sin esto, una dueña
// nueva no tenía en el menú ningún camino a crear o activar su bono.
// '/mensajeria' entra el 14-sep: es la ÚNICA entrada con contador de no leídos,
// y fuera del modo por defecto ese contador no lo veía nadie — una alumna
// escribía y la propietaria no tenía forma de enterarse sin ir a buscarlo.
export const ESSENTIAL_HREFS = ['/dashboard', '/centro-de-control', '/calendario', '/citas', '/clientas', '/mensajeria', '/equipo', '/cobros', '/productos', '/informes', '/configuracion', '/migracion', '/actualizaciones'];

// Módulos que nunca se pueden ocultar (acceso crítico a facturación/config).
export const NO_OCULTABLES = ['/dashboard', '/configuracion', '/suscripcion'];

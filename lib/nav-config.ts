// Config de navegación del panel — fuente única compartida por el sidebar y el
// editor de menú (Fase 4). Extraído de components/layout/sidebar.tsx.

import {
  LayoutDashboard, Calendar, Users, CreditCard,
  Settings, BarChart2,
  Clock, MessageCircle, Megaphone, Play,
  Bot, Package, Store, Inbox,
  UserCog, Users2, Compass, Replace, Network,
  Calculator, Notebook, DownloadCloud,
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
}
export interface NavSection {
  label?: string;
  items: NavItemDef[];
}

const allSections: NavSection[] = [
  { items: [{ href: '/centro-de-control', label: 'Centro de Control', icon: Compass }] },
  { items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  { items: [{ href: '/automatizaciones', label: 'Automatizaciones IA', icon: Bot }] },
  {
    // Contenido (redes) y Marketing (campañas/automatizaciones/Klaviyo) eran
    // dos promesas de producto separadas en el menú. Ya no es una sección con
    // 8 entradas — un solo enlace, /marketing, con las pantallas de contenido
    // (calendario/biblioteca/ideas/métricas) alcanzables
    // en un clic desde ahí mismo (pestaña "Contenido" dentro de la página,
    // que enlaza al hub /contenido, que a su vez enlaza al resto — ver
    // ACCESOS en app/(dashboard)/contenido/page.tsx). Antes eran 8 items de
    // sidebar para una sola promesa de producto.
    items: [{ href: '/marketing', label: 'Marketing', icon: Megaphone }],
  },
  {
    label: 'Clases',
    items: [
      { href: '/calendario', label: 'Calendario', icon: Calendar },
      { href: '/citas', label: 'Citas', icon: Clock },
      { href: '/sustituciones', label: 'Sustituciones', icon: Replace },
    ],
  },
  {
    label: 'Clientas',
    items: [
      { href: '/clientas', label: 'Clientas', icon: Users },
      { href: '/mensajeria', label: 'Mensajería', icon: Inbox },
      { href: '/comunidad', label: 'Comunidad', icon: MessageCircle },
      { href: '/chat', label: 'Chat de equipo', icon: Users2 },
    ],
  },
  {
    label: 'Ventas',
    items: [
      // "Cobros" reúne pendientes, facturas y movimientos: antes eran tres
      // entradas distintas para la misma pregunta ("¿quién me debe y cuánto ha
      // entrado?"). La caja se llama Caja y no POS porque es la palabra que se
      // usa en el mostrador.
      { href: '/cobros', label: 'Cobros', icon: CreditCard },
      { href: '/pos', label: 'Caja', icon: Store },
      { href: '/productos', label: 'Membresías', icon: Package },
    ],
  },
  {
    label: 'Estudio',
    items: [
      { href: '/equipo', label: 'Equipo', icon: UserCog },
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
      { href: '/ondemand', label: 'Oferta digital', icon: Play },
      { href: '/informes', label: 'Informes', icon: BarChart2 },
      { href: '/cierre', label: 'Cierre de año', icon: Calculator },
      { href: '/libreta', label: 'Libreta de clientas', icon: Notebook },
      // La pantalla existía pero no había forma de llegar a ella: había que
      // saberse la URL. Se llama "Traer mis datos" y no "Migración" porque nadie
      // que viene de otra app piensa en migrar, piensa en traerse lo suyo.
      { href: '/migracion', label: 'Traer mis datos', icon: DownloadCloud },
      { href: '/configuracion', label: 'Configuración', icon: Settings },
      { href: '/suscripcion', label: 'Suscripción', icon: CreditCard },
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

// Feature-freeze PMF: saca los módulos congelados (/pos, /comunidad, /ondemand)
// del menú y de TODO lo que deriva de él —editor de menú, buscador ⌘K, MODULOS—,
// con independencia del flag de marketing, y elimina las secciones que quedan
// vacías. Reactivar = quitar la ruta de RUTAS_CONGELADAS en lib/frozen-features.ts.
export const navSections: NavSection[] = conMarketing
  .map((s) => ({ ...s, items: s.items.filter((i) => !esRutaCongelada(i.href)) }))
  .filter((s) => s.items.length > 0);

// Lista plana de todos los módulos, en orden natural.
export const MODULOS: NavItemDef[] = navSections.flatMap((s) => s.items);

export const bottomNavItems: NavItemDef[] = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
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
export const ESSENTIAL_HREFS = ['/centro-de-control', '/dashboard', '/calendario', '/citas', '/clientas', '/equipo', '/cobros', '/informes', '/configuracion', '/migracion'];

// Módulos que nunca se pueden ocultar (acceso crítico a facturación/config).
export const NO_OCULTABLES = ['/dashboard', '/configuracion', '/suscripcion'];

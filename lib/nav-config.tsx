// Config de navegación del panel — fuente única compartida por el sidebar y el
// editor de menú (Fase 4). Extraído de components/layout/sidebar.tsx.

import {
  LayoutDashboard, Calendar, Users, CreditCard,
  FileText, Settings, BarChart2,
  Clock, MessageCircle, Megaphone, Play,
  Bot, ArrowLeftRight, Package, Store, Inbox,
  UserCog, Users2, Compass, Replace,
  Sparkles, CalendarDays, Library, Lightbulb, LineChart, ScrollText, GalleryHorizontalEnd,
} from 'lucide-react';
import { MARKETING_MODULE_ENABLED } from '@/lib/feature-flags';

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
    label: 'Contenido',
    items: [
      { href: '/contenido', label: 'Panel de contenido', icon: Sparkles },
      { href: '/contenido/calendario', label: 'Calendario de contenido', icon: CalendarDays },
      { href: '/contenido/biblioteca', label: 'Biblioteca', icon: Library },
      { href: '/contenido/ideas', label: 'Ideas', icon: Lightbulb },
      { href: '/contenido/metricas', label: 'Métricas de redes', icon: LineChart },
      { href: '/contenido/guiones', label: 'Guiones IA', icon: ScrollText },
      { href: '/contenido/carruseles', label: 'Carruseles IA', icon: GalleryHorizontalEnd },
    ],
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
    label: 'Clientes',
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
      { href: '/productos', label: 'Productos', icon: Package },
    ],
  },
  {
    label: 'Estudio',
    items: [
      { href: '/equipo', label: 'Equipo', icon: UserCog },
      { href: '/marketing', label: 'Marketing', icon: Megaphone },
      { href: '/ondemand', label: 'Oferta digital', icon: Play },
      { href: '/informes', label: 'Informes', icon: BarChart2 },
      { href: '/configuracion', label: 'Mi estudio', icon: Settings },
      { href: '/suscripcion', label: 'Suscripción', icon: CreditCard },
    ],
  },
];

// Interruptor temporal: oculta el módulo Contenido (/contenido/*) y el módulo
// Marketing del estudio (/marketing) del menú. El código sigue en el repo; para
// reactivar, poner MARKETING_MODULE_ENABLED a true en lib/feature-flags.ts.
const OCULTOS_MARKETING = ['/marketing', '/ondemand'];
export const navSections: NavSection[] = MARKETING_MODULE_ENABLED
  ? allSections
  : allSections
      .filter((s) => s.label !== 'Contenido')
      .map((s) => ({ ...s, items: s.items.filter((i) => !OCULTOS_MARKETING.includes(i.href)) }));

// Lista plana de todos los módulos, en orden natural.
export const MODULOS: NavItemDef[] = navSections.flatMap((s) => s.items);

export const bottomNavItems: NavItemDef[] = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
  { href: '/calendario', label: 'Clases', icon: Calendar },
  { href: '/clientas', label: 'Clientas', icon: Users },
  { href: '/cobros', label: 'Cobros', icon: CreditCard },
];

// Modo Esencial: módulos del día a día (preferencia de UI por-navegador).
export const ESSENTIAL_HREFS = ['/centro-de-control', '/dashboard', '/calendario', '/citas', '/clientas', '/equipo', '/cobros', '/informes', '/configuracion'];

// Módulos que nunca se pueden ocultar (acceso crítico a facturación/config).
export const NO_OCULTABLES = ['/dashboard', '/configuracion', '/suscripcion'];

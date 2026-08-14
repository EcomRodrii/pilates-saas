'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, Heart, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Sub-nav de Tentare Network dentro del panel (Fase 2, punto 16 del brief:
// "separado del dashboard normal... así no contaminas el SaaS principal").
// Mismo patrón que app/(dashboard)/contenido/layout.tsx — un layout anidado
// con una barra de pills por encima de `children`, sin tocar DashboardShell
// (topbar, sidebar general, auth guard, puedeVer() siguen igual). La
// separación visual la da esta barra, no un chrome nuevo.
//
// Solo lo que ya funciona hoy: Buscar instructoras, Favoritas, Mensajes.
// Deja hueco a propósito — el día que existan Mis candidatas/Mis vacantes/
// Candidaturas, se añaden a este mismo array.
const SUBNAV = [
  { href: '/network/buscar', label: 'Buscar instructoras', icon: Search },
  { href: '/network/favoritas', label: 'Favoritas', icon: Heart },
  { href: '/network/mensajes', label: 'Mensajes', icon: MessageCircle },
];

export default function NetworkPanelLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // La ficha de una candidata ([perfilId]) es una vista de detalle, no una
  // sección de primer nivel — mismo criterio que las páginas de detalle de
  // /contenido/*: sin sub-nav propio, solo su enlace "Volver".
  const esFichaDetalle = !SUBNAV.some(s => pathname === s.href);

  return (
    <div className="space-y-6">
      {!esFichaDetalle && (
        <nav className="-mx-1 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5 px-1 min-w-max">
            {SUBNAV.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition-colors',
                    active
                      ? 'bg-foreground text-background'
                      : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground',
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
      {children}
    </div>
  );
}

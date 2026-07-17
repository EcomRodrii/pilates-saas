'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ContenidoProvider } from '@/lib/contenido/store';
import {
  Sparkles, CalendarDays, Library, Lightbulb, LineChart, ScrollText, GalleryHorizontalEnd,
} from 'lucide-react';

const SUBNAV = [
  { href: '/contenido', label: 'Panel', icon: Sparkles },
  { href: '/contenido/calendario', label: 'Calendario', icon: CalendarDays },
  { href: '/contenido/biblioteca', label: 'Biblioteca', icon: Library },
  { href: '/contenido/ideas', label: 'Ideas', icon: Lightbulb },
  { href: '/contenido/metricas', label: 'Métricas', icon: LineChart },
  { href: '/contenido/guiones', label: 'Guiones IA', icon: ScrollText },
  { href: '/contenido/carruseles', label: 'Carruseles IA', icon: GalleryHorizontalEnd },
];

export default function ContenidoLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ContenidoProvider>
      <nav className="mb-6 -mx-1 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 px-1 min-w-max">
          {SUBNAV.map(({ href, label, icon: Icon }) => {
            const active = href === '/contenido' ? pathname === href : pathname.startsWith(href);
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
      {children}
    </ContenidoProvider>
  );
}

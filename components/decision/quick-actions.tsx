'use client';

import Link from 'next/link';
import { CalendarPlus, UserPlus, ShoppingCart, FileText, Calendar } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

// Accesos rápidos (Bible doc 4): siempre visibles, nunca escondidos.
const ACCESOS = [
  { href: '/calendario', label: 'Nueva reserva', icon: CalendarPlus },
  { href: '/clientas', label: 'Nueva clienta', icon: UserPlus },
  { href: '/pos', label: 'Nueva venta', icon: ShoppingCart },
  { href: '/cobros?tab=facturas', label: 'Nueva factura', icon: FileText },
  { href: '/calendario', label: 'Nueva clase', icon: Calendar },
];

export function QuickActions() {
  return (
    <div className="flex flex-wrap gap-2">
      {ACCESOS.map((a, i) => (
        <Link key={`${a.href}-${i}`} href={a.href} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          <a.icon size={14} /> {a.label}
        </Link>
      ))}
    </div>
  );
}

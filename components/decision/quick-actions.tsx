'use client';

import Link from 'next/link';
import { CalendarPlus, UserPlus, FileText } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

// Accesos rápidos (Bible doc 4): siempre visibles, nunca escondidos.
// CONGELADO (feature-freeze PMF): se quitó el acceso "Nueva venta" → /pos.
//
// Auditoría de arquitectura (22-sep-2026): había "Nueva reserva" y "Nueva
// clase" a la vez, las dos a `/calendario` sin query param que las
// distinguiera — /calendario no lee ninguno hoy, así que las dos aterrizaban
// exactamente en el mismo sitio sin abrir nada. Colapsadas en una: "Nueva
// clase" es lo que de verdad se crea ahí (el hueco de horario); una reserva
// necesita una clase ya existente en la que reservar.
const ACCESOS = [
  { href: '/calendario', label: 'Nueva clase', icon: CalendarPlus },
  { href: '/clientas?nuevo=1', label: 'Nueva clienta', icon: UserPlus },
  { href: '/cobros?tab=facturas', label: 'Nueva factura', icon: FileText },
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

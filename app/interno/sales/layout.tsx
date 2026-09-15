'use client';

import Link from 'next/link';
import { LayoutGrid, Settings } from 'lucide-react';
import { useSesionInterna } from '../layout.tsx';

const SECCIONES = [
  { href: '/interno/sales', label: 'CRM', icon: LayoutGrid },
  { href: '/interno/sales/config', label: 'Configuración', icon: Settings },
];

export default function LayoutSales({ children }: { children: React.ReactNode }) {
  const _sesion = useSesionInterna();

  return (
    <div className="flex gap-6">
      {/* Sidebar vertical */}
      <nav className="w-48 space-y-1 border-r">
        {SECCIONES.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors"
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Contenido */}
      <main className="flex-1 min-h-screen py-6">
        {children}
      </main>
    </div>
  );
}

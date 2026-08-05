'use client';

import Link from 'next/link';
import { ArrowRight, Compass } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { calcularCatalogoFunciones } from '@/lib/funciones-catalogo';

// "Explorar todas las funciones" — botón secundario junto al tour en
// /primeros-pasos. A diferencia de esa página (solo lo pendiente de
// configurar), esto enseña TODO lo que hace Tentare, para descubrir
// funcionalidad que no se sabía que existía. Sin progreso, sin checkboxes:
// cada función es un enlace directo.
export default function ExplorarFuncionesPage() {
  const categorias = calcularCatalogoFunciones();

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        back={{ href: '/primeros-pasos', label: 'Volver a primeros pasos' }}
        title="Explorar todas las funciones"
        description="Todo lo que hace Tentare, organizado por lo que resuelve — no hace falta que lo hayas configurado para echar un vistazo."
      />

      <div className="space-y-4">
        {categorias.map(cat => (
          <div key={cat.id} className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Compass size={14} className="text-brand-secondary" />
              <p className="text-[13px] font-semibold text-foreground">{cat.label}</p>
            </div>
            <div className="divide-y divide-muted">
              {cat.funciones.map(f => (
                <Link key={f.href} href={f.href} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-foreground">{f.label}</span>
                    <span className="block text-[12px] text-muted-foreground mt-0.5">{f.descripcion}</span>
                  </span>
                  <ArrowRight size={14} className="text-muted-foreground shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

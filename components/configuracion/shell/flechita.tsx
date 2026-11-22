'use client';

import { ChevronRight } from 'lucide-react';

/**
 * La flechita al final de una fila que abre algo. Shopify la lleva en cada fila que abre una subpágina
 * (medido en su Configuración, 22-nov-2026), así que se queda; las que sobran son las del menú.
 */
export function Flechita({ size = 18 }: { size?: number }) {
  return <ChevronRight size={size} className="shrink-0 text-muted-foreground" aria-hidden />;
}

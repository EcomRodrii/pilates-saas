'use client';

import { ChevronRight } from 'lucide-react';
import { useShellNuevo } from '@/lib/estudio/panel-nuevo-cliente';

/**
 * La flechita al final de una fila que abre algo. Con el shell nuevo (`SHELL_NUEVO`) no se pinta:
 * en la Configuración de Shopify la fila entera ya es el botón (fundador, 22-nov-2026: «quita
 * también las mini flechitas»).
 */
export function Flechita({ size = 18 }: { size?: number }) {
  const shellNuevo = useShellNuevo();
  if (shellNuevo) return null;
  return <ChevronRight size={size} className="shrink-0 text-muted-foreground" aria-hidden />;
}

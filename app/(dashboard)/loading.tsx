import { PanelSkeleton } from '@/components/ui/panel-skeleton';

// Pantalla de carga del segmento del panel.
//
// El layout y todas las páginas del panel son 'use client', así que en una carga
// fría el navegador no tiene NADA que pintar hasta haber descargado y ejecutado
// el bundle (~2,3 MB en 46 ficheros, porque studio-context arrastra
// lib/supabase-data entero en cada pantalla). Eso son varios segundos de blanco
// absoluto, y en el móvil del estudio bastantes más.
//
// Este fichero lo renderiza Next en el SERVIDOR y se envía con el primer HTML,
// así que se ve de inmediato, antes de que llegue una sola línea de JavaScript.
// El `if (loading)` del layout cubre el tramo siguiente (sesión resolviéndose) y
// `cargandoDatos` el último (datos del estudio): entre los tres, ya no hay ningún
// hueco en blanco de punta a punta.
//
// Esto arregla la PERCEPCIÓN, no el peso. Partir lib/supabase-data.ts (5.359
// líneas) para que cada pantalla cargue solo lo suyo sigue pendiente y es lo que
// de verdad bajaría el tiempo.
export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="lg:pl-[var(--sidebar-w)]">
        <div className="pt-14 lg:pt-2 pb-20 lg:pb-0 max-w-[1320px] mx-auto px-4 lg:px-6 py-6 lg:py-6">
          <PanelSkeleton />
        </div>
      </div>
    </div>
  );
}

import { cn } from '@/lib/utils';
import { Hero3D, type Escena3D } from './hero-3d';

// ─────────────────────────────────────────────────────────────────────────────
// La imagen de una tarjeta de «siguiente paso» del Resumen (marco nuevo): la escena 3D de ese paso (los ids de
// `lib/onboarding.ts` y de `lib/guia/primeros-pasos.ts`) sobre el fondo gris suave, en el hueco de 286 × 140 de la
// tarjeta. Decorativa: el título y el texto de la tarjeta dicen lo que toca.
// ─────────────────────────────────────────────────────────────────────────────

const ESCENA_DEL_PASO: Record<string, Escena3D> = {
  cuenta: 'integraciones', salas: 'salas', instructor: 'equipo', equipo: 'equipo',
  clase: 'calendario', 'primera-clase': 'calendario', horario: 'horario', reservas: 'citas',
  'primera-reserva': 'avisos', compartir: 'mensajeria', bonos: 'paquetes', stripe: 'cobros',
  clientes: 'clientes', alumnas: 'clientes', marca: 'marca', fiscales: 'fiscales',
};

/** La imagen de una tarjeta de paso, con el bisel interior de la tarjeta. */
export function IlustracionPaso({ id, className }: { id: string; className?: string }) {
  return (
    <div data-paso={id} className={cn('relative aspect-[286/140] w-full overflow-hidden rounded-xl bg-[var(--t-surface-sunken)]', className)} aria-hidden="true">
      <Hero3D escena={ESCENA_DEL_PASO[id] ?? 'vacio'} className="mx-auto h-full w-auto" />
      {/* Bisel interior: aro, filo superior claro y sombras inferior/derecha, como las imágenes de las tarjetas de Shopify. */}
      <span className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_0_0_1px_#14181c17,inset_0_1px_0_#ffffffe0,inset_1px_0_0_#ffffff85,inset_0_-1px_0_#14181c14,inset_-1px_0_0_#14181c0d]" />
    </div>
  );
}

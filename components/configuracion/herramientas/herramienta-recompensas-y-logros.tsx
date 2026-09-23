'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ChevronRight, Gift } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { ANCLA_DECIDIR } from '@/lib/estado-estudio-cliente';
import { cn } from '@/lib/utils';
import { PlanGate } from '@/components/ui/plan-gate';
import { cardCls } from '@/components/configuracion/estilos';
import { TabRecompensas } from '@/components/configuracion/tab-recompensas';
import { TabCanjes } from '@/components/configuracion/tab-canjes';
import { TabLogros } from '@/components/configuracion/tab-logros';
import { TabNiveles } from '@/components/configuracion/tab-niveles';
import { TabRetos } from '@/components/configuracion/tab-retos';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';

// Los catálogos de Motivación: recompensas, canjes, logros, niveles y retos.
// Cómo funcionan tus créditos (nombre, caducidad, racha) y cuántos se ganan con
// cada cosa se quedan en la sección, en sus cajones: son ajustes, no catálogos.
export function HerramientaRecompensasYLogros({ showToast }: { showToast: (m: string) => void }) {
  const { studio, cargarGamificacion } = useStudio();

  // Las tablas de gamificación no vienen en el arranque del panel (ver
  // seccion-motivacion.tsx). Se entra aquí también por un enlace directo.
  useEffect(() => { cargarGamificacion(); }, [cargarGamificacion]);

  return (
    <PlanGate studio={studio ?? {}} feature="gamificacion">
      <TabRecompensas showToast={showToast} />
      <TarjetaAjuste id="canjes" marco={false}>
        <div className="space-y-4">
          <CanjesPorEntregar />
          <TabCanjes showToast={showToast} />
        </div>
      </TarjetaAjuste>
      <TabLogros showToast={showToast} />
      <TabNiveles showToast={showToast} />
      <TabRetos showToast={showToast} />
    </PlanGate>
  );
}

// Entregar un canje es trabajo del día, no un ajuste: se hace desde la bandeja
// de Resumen («Decidir»), donde lo ve también recepción. Aquí se dice cuántos
// esperan y se lleva allí. La lista de abajo se queda porque es el único sitio
// con el historial y con «Cancelar», que devuelve los créditos.
function CanjesPorEntregar() {
  const { rewardRedemptions, gamificacionCargada } = useStudio();
  if (!gamificacionCargada) return null;
  const n = rewardRedemptions.filter(r => r.estado === 'PENDIENTE').length;
  if (n === 0) return null;
  return (
    <Link
      href={`/dashboard#${ANCLA_DECIDIR.canjesPorEntregar}`}
      className={cn(cardCls, 'flex min-h-16 max-w-3xl items-center gap-3 px-4 py-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50')}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
        <Gift size={20} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-foreground">
          {n === 1 ? '1 canje por entregar' : `${n} canjes por entregar`}
        </span>
        <span className="block text-sm text-muted-foreground">Se entregan desde Resumen, donde también los ve recepción</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

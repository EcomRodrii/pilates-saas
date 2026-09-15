'use client';

import { useStudio } from '@/lib/studio-context';
import { tieneFeature } from '@/lib/billing/entitlements';
import { TabClases } from '@/components/configuracion/tab-clases';
import { TabServiciosCita } from '@/components/configuracion/tab-servicios-cita';
import { TabHorarioCitas } from '@/components/configuracion/tab-horario-citas';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';
import { TarjetaEnlace } from '@/components/configuracion/shell/tarjeta-enlace';

// Mis clases y citas: lo que ofreces.
export function SeccionClases({ showToast }: { showToast: (m: string) => void }) {
  const { studio } = useStudio();
  // El catálogo de la cadena solo se pinta con plan Cadena y la sede ya dentro
  // de una cadena (el mismo criterio que TabEstudioSedes).
  const esCadena = !!studio?.cadenaId
    && tieneFeature({ plan: studio.plan, subscriptionStatus: studio.subscriptionStatus }, 'multiCentro');

  return (
    <>
      <TarjetaAjuste id="tipos-de-clase" marco={false}>
        <TabClases showToast={showToast} />
      </TarjetaAjuste>
      {esCadena && <TarjetaEnlace id="catalogo-de-la-cadena" />}
      <TarjetaAjuste id="servicios-de-cita" marco={false}>
        <TabServiciosCita showToast={showToast} />
      </TarjetaAjuste>
      <TarjetaAjuste id="horario-de-citas" marco={false}>
        <TabHorarioCitas showToast={showToast} />
      </TarjetaAjuste>
    </>
  );
}

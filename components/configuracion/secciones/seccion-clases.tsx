'use client';

import { useStudio } from '@/lib/studio-context';
import { tieneFeature } from '@/lib/billing/entitlements';
import { resumenHerramienta } from '@/lib/configuracion/resumenes';
import { TabServiciosCita } from '@/components/configuracion/tab-servicios-cita';
import { TabHorarioCitas } from '@/components/configuracion/tab-horario-citas';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';
import { FilasHerramienta } from '@/components/configuracion/shell/fila-herramienta';
import { TabCatalogoCadena } from '@/components/configuracion/tab-catalogo-cadena';

// Mis clases y citas: lo que ofreces. El catálogo de tipos de clase, con el
// cajón de cada uno, tiene su propia pantalla.
export function SeccionClases({ showToast }: { showToast: (m: string) => void }) {
  const { studio, dataLoaded, tiposClase } = useStudio();
  // El catálogo de la cadena solo se pinta con plan Cadena y la sede ya dentro
  // de una cadena (el mismo criterio que TabEstudioSedes).
  const esCadena = !!studio?.cadenaId
    && tieneFeature({ plan: studio.plan, subscriptionStatus: studio.subscriptionStatus }, 'multiCentro');

  return (
    <>
      <FilasHerramienta
        filas={[{ id: 'tipos-de-clase', valor: resumenHerramienta('tipos-de-clase', { numTiposClase: dataLoaded ? tiposClase.length : null }) }]}
      />
      {esCadena && studio?.cadenaId && <TabCatalogoCadena cadenaId={studio.cadenaId} showToast={showToast} />}
      <TarjetaAjuste id="servicios-de-cita" marco={false}>
        <TabServiciosCita showToast={showToast} />
      </TarjetaAjuste>
      <TarjetaAjuste id="horario-de-citas" marco={false}>
        <TabHorarioCitas showToast={showToast} />
      </TarjetaAjuste>
    </>
  );
}

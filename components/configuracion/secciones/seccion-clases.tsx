'use client';

import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { tarjetaVisible } from '@/lib/configuracion/secciones';
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
  const rol = useRol();
  // El catálogo de la cadena solo se pinta con plan Cadena y la sede ya dentro
  // de una cadena (el mismo criterio que TabEstudioSedes).
  const esCadena = !!studio?.cadenaId
    && tieneFeature({ plan: studio.plan, subscriptionStatus: studio.subscriptionStatus }, 'multiCentro');

  return (
    <>
      <FilasHerramienta
        filas={[{ id: 'tipos-de-clase', valor: resumenHerramienta('tipos-de-clase', { numTiposClase: dataLoaded ? tiposClase.length : null }) }]}
      />
      {/* El catálogo de la cadena y los servicios de cita (que llevan precio)
          son de la propietaria: su RLS exige `puede_configurar_negocio()`, así
          que a la gerencia ni se le enseñan. El horario de citas sí es suyo. */}
      {esCadena && studio?.cadenaId && tarjetaVisible('catalogo-de-la-cadena', rol) && (
        <TabCatalogoCadena cadenaId={studio.cadenaId} showToast={showToast} />
      )}
      {tarjetaVisible('servicios-de-cita', rol) && (
        <TarjetaAjuste id="servicios-de-cita" marco={false}>
          <TabServiciosCita showToast={showToast} />
        </TarjetaAjuste>
      )}
      {tarjetaVisible('horario-de-citas', rol) && (
        <TarjetaAjuste id="horario-de-citas" marco={false}>
          <TabHorarioCitas showToast={showToast} />
        </TarjetaAjuste>
      )}
    </>
  );
}

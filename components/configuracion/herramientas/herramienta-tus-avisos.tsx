'use client';

import { NotificationPreferences } from '@/components/notifications/notification-preferences';
import { PanelSkeleton } from '@/components/ui/panel-skeleton';
import { authHeader } from '@/lib/api-client';
import { useCore } from '@/lib/core-context';
import { useRol } from '@/lib/permisos';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';

// La tabla de «Mis avisos», en su propia pantalla (`?tab=avisos&abrir=tus-avisos`).
// El mismo componente y la misma escritura de siempre: cada interruptor guarda al
// pulsarlo y vuelve atrás si el servidor dice que no.
export function HerramientaTusAvisos(_props: { showToast: (m: string) => void }) {
  const { studio } = useCore();
  const rol = useRol();
  return (
    <TarjetaAjuste id="tus-avisos" marco={false}>
      {studio?.id
        ? <NotificationPreferences role={rol} studioId={studio.id} getHeaders={authHeader} />
        : <PanelSkeleton />}
    </TarjetaAjuste>
  );
}

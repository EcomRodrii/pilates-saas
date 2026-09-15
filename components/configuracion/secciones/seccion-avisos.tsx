'use client';

import { NotificationPreferences } from '@/components/notifications/notification-preferences';
import { PanelSkeleton } from '@/components/ui/panel-skeleton';
import { authHeader } from '@/lib/api-client';
import { useCore } from '@/lib/core-context';
import { useRol } from '@/lib/permisos';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';

// Mis avisos: los que te llegan a ti. Era /configuracion/notificaciones, una
// pantalla que no enlazaba nadie (hoy redirige aquí). El mismo componente y la
// misma escritura: cada interruptor guarda al pulsarlo y vuelve atrás si el
// servidor dice que no.
//
// Cada rol ve SOLO sus categorías (`CATEGORIAS_POR_ROL`). Hoy Configuración es
// solo de la propietaria; abrirla a otros roles es otra revisión (servidor y RLS).
export function SeccionAvisos() {
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

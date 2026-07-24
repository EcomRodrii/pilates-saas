'use client';

import { PageHeader } from '@/components/ui/page-header';
import { NotificationPreferences } from '@/components/notifications/notification-preferences';
import { authHeader } from '@/lib/api-client';
import { useCore } from '@/lib/core-context';

// Preferencias de notificación del staff (propietaria/instructora). Se muestran
// las categorías de la propietaria (superset del staff); una instructora solo
// recibe de hecho clases/sustituciones, así que el resto le son inocuas.
export default function ConfiguracionNotificacionesPage() {
  const { studio } = useCore();
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Notificaciones"
        description="Elige qué avisos quieres recibir y por dónde. Los cambios se guardan solos."
      />
      {studio?.id
        ? <NotificationPreferences role="PROPIETARIO" studioId={studio.id} getHeaders={authHeader} />
        : <p className="text-[13px] text-muted-foreground">Cargando…</p>}
    </div>
  );
}

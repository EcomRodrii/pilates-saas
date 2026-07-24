'use client';

import { PageHeader } from '@/components/ui/page-header';
import { NotificationPreferences } from '@/components/notifications/notification-preferences';
import { authHeader } from '@/lib/api-client';
import { useCore } from '@/lib/core-context';
import { useRol } from '@/lib/permisos';

// Preferencias de notificación del staff. Cada rol (propietaria / instructora /
// recepción) ve SOLO sus categorías (CATEGORIAS_POR_ROL): antes se forzaba
// 'PROPIETARIO' y una instructora/recepción veía categorías que nunca recibe.
export default function ConfiguracionNotificacionesPage() {
  const { studio } = useCore();
  const rol = useRol();
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Notificaciones"
        description="Elige qué avisos quieres recibir y por dónde. Los cambios se guardan solos."
      />
      {studio?.id
        ? <NotificationPreferences role={rol} studioId={studio.id} getHeaders={authHeader} />
        : <p className="text-[13px] text-muted-foreground">Cargando…</p>}
    </div>
  );
}

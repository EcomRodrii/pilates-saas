'use client';

import { useCallback, useState } from 'react';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { useToast } from '@/components/student/ui/Toast';
import { getNotificaciones, marcarLeidas } from '@/lib/student/perfil-y-avisos';
import { NotificationItem } from '@/components/student/domain/NotificationItem';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// Notificaciones (§A.16). El motor ya existía entero; lo que no había era una
// pantalla donde una alumna las viera.
//
// ⚠️ Los enlaces se traducen al leer (`lib/student/deep-links.ts`). El deep link
// se calcula al INSERTAR y se persiste, así que las filas ya emitidas llevan
// rutas del portal borrado: reescribir el catálogo solo arregla las nuevas.
export default function NotificacionesPage() {
  const { estudio } = useEstudio();
  const { toast } = useToast();
  const [marcando, setMarcando] = useState(false);

  const cargar = useCallback(
    () => getNotificaciones(estudio.slug, estudio.id),
    [estudio.slug, estudio.id],
  );
  const { data, estado, reintentar } = useAsync(cargar);

  const noLeidas = data?.filter((n) => !n.leida).length ?? 0;

  const marcarTodas = async () => {
    setMarcando(true);
    const ok = await marcarLeidas(estudio.id);
    setMarcando(false);
    // Solo se dice «marcadas» si el servidor lo confirma: el paquete lo canta
    // sin preguntar, y con la red caída eso es un aviso falso.
    toast(ok ? 'Marcadas como leídas ✓' : 'No hemos podido marcarlas. Inténtalo otra vez.');
    if (ok) reintentar();
  };

  return (
    <StudentShell>
      <PageHeader
        titulo="Notificaciones"
        sub={noLeidas ? `${noLeidas} sin leer` : undefined}
        back
        accion={noLeidas > 0 ? (
          <button type="button" className="btn btn--secondary btn--sm" disabled={marcando} onClick={() => void marcarTodas()}>
            {marcando ? 'Marcando…' : 'Marcar leídas'}
          </button>
        ) : undefined}
      />
      <div className="px" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        {estado === 'loading' && <ListSkeleton n={4} h={78} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && !data && <OfflineState />}
        {estado === 'empty' && (
          <EmptyState
            icono="🔔"
            titulo="Todo al día"
            cuerpo="Te avisaremos de plazas liberadas, recordatorios y novedades del estudio."
          />
        )}
        {estado === 'ready' && data?.map((n, i) => <NotificationItem key={n.id} n={n} delay={i * 50} />)}
      </div>
    </StudentShell>
  );
}

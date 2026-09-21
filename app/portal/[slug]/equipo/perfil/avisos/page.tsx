'use client';

import { useCallback } from 'react';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { useOnline } from '@/lib/student/useOnline';
import { getPreferencias } from '@/lib/student/perfil-y-avisos';
import { ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';
import { PushPorTipo, estadoInicialPush } from '@/components/student/domain/PushPorTipo';

// Qué le avisamos al móvil a la instructora, tipo a tipo. Página propia y no
// `/perfil/preferencias`: aquella vive en el marco de la alumna, cuya guardia
// manda a `/equipo` a quien no tiene ficha de alumna. Mismas preferencias
// (son de su cuenta) y mismo componente; cambia la lista (`PUSH_POR_TIPO.INSTRUCTOR`).
export default function AvisosInstructoraPage() {
  const { estudio } = useEstudio();
  const { online } = useOnline();

  const cargar = useCallback(async () => estadoInicialPush('INSTRUCTOR', await getPreferencias()), []);
  const { estado, data, reintentar } = useAsync(cargar, () => false);

  return (
    <StudentShell modo="instructora">
      <PageHeader titulo="Avisos en el móvil" back />
      <div className="px" style={{ marginTop: 14, maxWidth: 520 }}>
        {estado === 'loading' && <ListSkeleton n={3} h={120} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && <OfflineState cuerpo="Necesitas conexión para cambiar tus avisos." />}
        {estado === 'ready' && data && (
          <>
            <p className="t-meta" style={{ margin: '0 0 14px', lineHeight: 1.5 }}>
              Elige qué te avisamos al móvil. Lo que apagues seguirá apareciendo en tus avisos dentro de la app.
            </p>
            <PushPorTipo rol="INSTRUCTOR" studioId={estudio.id} inicial={data} online={online} />
          </>
        )}
      </div>
    </StudentShell>
  );
}

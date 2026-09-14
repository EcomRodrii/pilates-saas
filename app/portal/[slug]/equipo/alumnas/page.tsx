'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionInstructora } from '@/lib/student/sesion-instructora';
import { useAsync } from '@/lib/student/useAsync';
import { etiquetaDia, hoyISO } from '@/lib/student/formato';
import { getAlumnasInstructora } from '@/lib/student/datos-instructora';
import { AvatarSocia } from '@/components/student/domain/AvatarSocia';
import { Badge } from '@/components/student/ui/Badge';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// «Tus alumnas»: las de sus clases de los últimos 30 días y los próximos 30 (la
// misma regla que decide si puede ver su salud). Lo mínimo para dar clase:
// nombre, foto, su próxima clase con ella y si es su primera vez. Nada de
// contacto, pagos ni bonos (decisión del 14-sep-2026).

export default function AlumnasInstructoraPage() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const { instructora } = useSesionInstructora(estudio.slug, true, true);
  const esInstructora = Boolean(instructora);
  const hoy = hoyISO();

  const cargar = useCallback(
    // Monta antes que su guardia (es su padre): sin confirmar, no se pide nada.
    () => (esInstructora ? getAlumnasInstructora(estudio.slug) : new Promise<never>(() => {})),
    [esInstructora, estudio.slug],
  );
  const { data, estado, reintentar } = useAsync(cargar, () => false);

  return (
    <StudentShell modo="instructora">
      <PageHeader back titulo="Tus alumnas" sub="De tus clases de los últimos 30 días y los próximos 30" />
      <div className="px stack" style={{ ['--gap' as string]: 'var(--s-2)', marginTop: 14, paddingBottom: 24 }}>
        {estado === 'loading' && <ListSkeleton n={4} h={64} />}
        {estado === 'error' && <ErrorState cuerpo="No hemos podido cargar tus alumnas." onRetry={reintentar} />}
        {estado === 'offline' && <OfflineState cuerpo="Para ver a tus alumnas necesitas conexión." />}

        {data && data.length === 0 && (
          <EmptyState
            ilustracion="calendario"
            titulo="Todavía no tienes alumnas"
            cuerpo="Aparecerán cuando alguien reserve una de tus clases."
          />
        )}

        {data?.map((a) => (
          <Link
            key={a.socioId}
            href={href(`/equipo/alumnas/${encodeURIComponent(a.socioId)}`)}
            className="card card--tap"
            data-testid="alumna"
            style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12 }}
          >
            <AvatarSocia nombre={a.nombre} fotoUrl={a.fotoUrl} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="t-card-title trunc">{a.nombre}</p>
              <p className="t-meta trunc">
                {a.proxima
                  ? `Próxima: ${etiquetaDia(a.proxima.fecha, hoy)} · ${a.proxima.hora} · ${a.proxima.tipo}`
                  : 'Sin clases próximas contigo'}
              </p>
            </div>
            {a.primeraClase && a.proxima && <Badge tone="ok">Primera clase</Badge>}
          </Link>
        ))}
      </div>
    </StudentShell>
  );
}

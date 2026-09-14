'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionStudent } from '@/lib/student/sesion';
import { useSesionInstructora } from '@/lib/student/sesion-instructora';
import { useAsync } from '@/lib/student/useAsync';
import { addDias, fechaLarga, hoyISO } from '@/lib/student/formato';
import { getAgendaInstructora, getClasesComoAlumna } from '@/lib/student/datos-instructora';
import { unirAgenda } from '@/lib/student/agenda-instructora';
import { DateSelector } from '@/components/student/domain/DateSelector';
import { ClaseQueDaCard } from '@/components/student/domain/ClaseQueDaCard';
import { Badge } from '@/components/student/ui/Badge';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// Agenda de la instructora: las próximas dos semanas, día a día.
//
// AGENDA ÚNICA (decisión del 14-sep-2026, sin selector «Entrar como…»): si
// además es alumna del estudio, en la misma lista salen también las clases a
// las que viene, con su etiqueta. Así no se le esconde ninguna reserva.

const DIAS = 14;

export default function AgendaInstructoraPage() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const { socia } = useSesionStudent(estudio.slug);
  const { instructora } = useSesionInstructora(estudio.slug, true, true);
  const esAlumna = Boolean(socia);
  const esInstructora = Boolean(instructora);
  const hoy = hoyISO();
  const hasta = addDias(hoy, DIAS - 1);
  const [dia, setDia] = useState(hoy);

  // ⚠️ Sin confirmar que es instructora no se pide nada: esta pantalla monta
  // ANTES que su guardia (es su padre). Mientras no se sabe, «cargando».
  const cargar = useCallback(async () => {
    if (!esInstructora) return new Promise<never>(() => {});
    const [agenda, viene] = await Promise.all([
      getAgendaInstructora(estudio.slug, hoy, hasta),
      // Si falla el catálogo de alumna, su agenda de instructora se enseña igual.
      esAlumna ? getClasesComoAlumna(estudio.slug, hoy, hasta).catch(() => []) : Promise.resolve([]),
    ]);
    return { filas: unirAgenda(agenda.clases, viene), puedeCrearClases: agenda.puedeCrearClases };
  }, [esInstructora, estudio.slug, hoy, hasta, esAlumna]);

  const { data, estado, reintentar } = useAsync(cargar, () => false);
  const delDia = (data?.filas ?? []).filter((f) => f.clase.fecha === dia);

  return (
    <StudentShell modo="instructora">
      <PageHeader
        titulo="Agenda"
        sub={esAlumna ? 'Las clases que das y las que has reservado' : 'Las clases que das'}
        // Solo si el estudio le deja crear sus clases: un botón que acaba en «no
        // puedes» es peor que no tenerlo.
        accion={data?.puedeCrearClases ? (
          <Link href={href('/equipo/nueva-clase')} className="btn btn--secondary btn--sm tap" data-testid="nueva-clase">
            Nueva clase
          </Link>
        ) : undefined}
      />
      <div style={{ marginTop: 12 }}>
        <DateSelector value={dia} onChange={setDia} dias={DIAS} />
      </div>

      <div className="px stack" style={{ ['--gap' as string]: 'var(--s-2)', marginTop: 14 }}>
        {estado === 'loading' && <ListSkeleton n={3} h={96} />}
        {estado === 'error' && (
          <ErrorState cuerpo="No hemos podido cargar tu agenda. Tus clases siguen como estaban." onRetry={reintentar} />
        )}
        {estado === 'offline' && (
          <OfflineState cuerpo="Lo que ves es lo último que cargamos. Para ver cambios en tus clases necesitas conexión." />
        )}

        {data && delDia.length === 0 && (
          <EmptyState
            ilustracion="calendario"
            titulo={dia === hoy ? 'Hoy no tienes clases' : `No tienes clases el ${fechaLarga(dia)}`}
          />
        )}

        {data && delDia.map((f) => (f.tipo === 'da' ? (
          <ClaseQueDaCard
            key={`da-${f.clase.id}`}
            clase={f.clase}
            etiqueta={esAlumna ? 'Das clase' : undefined}
            href={href(`/equipo/clase/${encodeURIComponent(f.clase.id)}`)}
          />
        ) : (
          <Link
            key={`viene-${f.clase.reservaId}`}
            href={href('/mis-reservas')}
            className="card card--tap row"
            data-testid="clase-que-reserva"
            style={{ ['--gap' as string]: 'var(--s-3)', padding: 'var(--s-4)' }}
          >
            <div className="stack" style={{ ['--gap' as string]: 'var(--s-1)', minWidth: 0, flex: 1 }}>
              <p className="t-meta">{f.clase.hora}{f.clase.sala ? ` · ${f.clase.sala}` : ''}</p>
              <p className="t-card-title trunc">{f.clase.tipo}</p>
            </div>
            <Badge tone={f.clase.enEspera ? 'wait' : 'booked'}>{f.clase.enEspera ? 'En lista de espera' : 'Vienes a clase'}</Badge>
          </Link>
        )))}
      </div>
    </StudentShell>
  );
}

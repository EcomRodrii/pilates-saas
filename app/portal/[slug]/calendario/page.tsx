'use client';

import { useCallback, useState } from 'react';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { getBonos, getClases, getInstructoras, getReservas } from '@/lib/student/datos';
import { disponibilidad } from '@/lib/student/maquina-reserva';
import { etiquetaDia, hoyISO } from '@/lib/student/formato';
import { Calendar } from '@/components/student/domain/Calendar';
import { ClassCard } from '@/components/student/domain/ClassCard';
import { EmptyState, ErrorState, ListSkeleton, OfflineState, Skeleton } from '@/components/student/ui/States';

// Calendario (§A.11): vista mensual con puntos en los días que tiene clase.
//
// Los puntos marcan SUS reservas confirmadas, no los días con clases del
// estudio: el calendario es «mi mes», no el horario — para eso está /reservar.
export default function CalendarioPage() {
  const { estudio } = useEstudio();
  const [dia, setDia] = useState(hoyISO());

  const cargar = useCallback(async () => {
    const [clases, reservas, bonos, instructoras] = await Promise.all([
      getClases(estudio.slug), getReservas(estudio.slug), getBonos(estudio.slug), getInstructoras(estudio.slug),
    ]);
    return { clases, reservas, bonos, instructoras };
  }, [estudio.slug]);

  const { data, estado, reintentar } = useAsync(cargar, () => false);

  const reservadas = (data?.reservas ?? [])
    .filter((r) => r.estado === 'confirmada')
    .map((r) => data?.clases.find((c) => c.id === r.claseId)?.fecha)
    .filter((f): f is string => Boolean(f));

  const lista = (data?.clases ?? []).filter((c) => c.fecha === dia).sort((a, b) => a.hora.localeCompare(b.hora));
  const bono = data?.bonos.find((b) => b.estado === 'activo');

  return (
    <StudentShell>
      <PageHeader titulo="Calendario" back />
      <div className="px grid-lg-2" style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
        {estado === 'loading'
          ? <Skeleton h={330} r={16} />
          : <Calendar value={dia} onChange={setDia} marcados={reservadas} />}

        <section>
          <p className="t-label" style={{ margin: '0 0 9px' }}>
            {etiquetaDia(dia)} · {lista.length} {lista.length === 1 ? 'clase' : 'clases'}
          </p>
          {estado === 'loading' && <ListSkeleton n={3} />}
          {estado === 'error' && <ErrorState onRetry={reintentar} />}
          {estado === 'offline' && !data && <OfflineState />}
          {data && estado !== 'loading' && estado !== 'error' && (
            lista.length === 0
              ? <EmptyState icono="🌿" titulo="Día sin clases" cuerpo="El estudio no programa clases este día." />
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {lista.map((c, i) => (
                    <ClassCard
                      key={c.id}
                      clase={c}
                      instructora={data.instructoras.find((x) => x.id === c.instructoraId)}
                      estado={disponibilidad(c, data.reservas, estudio.soportaListaEspera)}
                      conBono={Boolean(bono)}
                      delay={i * 55}
                    />
                  ))}
                </div>
              )
          )}
        </section>
      </div>
    </StudentShell>
  );
}

'use client';

import { useCallback, useState } from 'react';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { getClases, getInstructoras, getReservas } from '@/lib/student/datos';
import { InstructorCard } from '@/components/student/domain/InstructorCard';
import { InstructoraSheet } from '@/components/student/domain/InstructoraSheet';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';
import type { Instructora } from '@/lib/student/tipos';

// «Conoce al equipo». Nace de la baldosa de Inicio: la maqueta la pedía y no
// había ningún sitio al que llevar — la ficha de una instructora solo se podía
// abrir desde dentro del horario, tocando su nombre en una clase concreta.
//
// ⚠️ No es una pantalla nueva de datos: la ficha (`InstructoraSheet`) y la
// tarjeta (`InstructorCard`) ya existían, y las tres consultas son las mismas
// que hace el horario. Lo único que faltaba era la puerta.
export default function InstructorasPage() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const [abierta, setAbierta] = useState<Instructora | null>(null);

  const cargar = useCallback(async () => {
    const [instructoras, clases, reservas] = await Promise.all([
      getInstructoras(estudio.slug), getClases(estudio.slug), getReservas(estudio.slug),
    ]);
    return { instructoras, clases, reservas };
  }, [estudio.slug]);

  const { data, estado, reintentar } = useAsync(cargar, () => false);

  return (
    <StudentShell>
      <PageHeader titulo="Instructoras" />

      <div className="px" style={{ marginTop: 4 }}>
        {estado === 'loading' && <ListSkeleton />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && !data && <OfflineState />}

        {data && estado !== 'loading' && estado !== 'error' && (
          data.instructoras.length === 0 ? (
            <EmptyState
              ilustracion="busqueda"
              titulo="Todavía no hay instructoras"
              cuerpo="Cuando el estudio dé de alta a su equipo, las verás aquí."
              accion="Ver el horario"
              href={href('/reservar')}
            />
          ) : (
            // Una por línea y a lo ancho: en el horario van en una fila que se
            // desplaza porque allí son un filtro, pero aquí son el contenido.
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 9, margin: 0, padding: 0, listStyle: 'none' }}>
              {data.instructoras.map((i, n) => (
                <li key={i.id} className="a-up" style={{ animationDelay: `${n * 45}ms` }}>
                  <InstructorCard i={i} ancha onClick={() => setAbierta(i)} />
                </li>
              ))}
            </ul>
          )
        )}
      </div>

      <InstructoraSheet
        instructora={abierta}
        clases={data?.clases ?? []}
        reservas={data?.reservas ?? []}
        soportaEspera={estudio.soportaListaEspera}
        open={abierta !== null}
        onClose={() => setAbierta(null)}
        href={href}
      />
    </StudentShell>
  );
}

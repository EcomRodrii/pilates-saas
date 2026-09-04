'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { getBonos, getClases, getInstructoras, getReservas } from '@/lib/student/datos';
import { disponibilidad } from '@/lib/student/maquina-reserva';
import { etiquetaDia, hoyISO } from '@/lib/student/formato';
import { DateSelector } from '@/components/student/domain/DateSelector';
import { ClassCard } from '@/components/student/domain/ClassCard';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// Horario (§A.6): días + filtros + lista de clases.
//
// ⚠️ El filtrado por día se hace en CLIENTE, igual que en el paquete, y aquí eso
// es una decisión con coste conocido: `getClases` sirve del catálogo que ya está
// en memoria, así que cambiar de día no dispara una petición — la pantalla
// responde al instante y sin red. Lo que NO se hace es pedir el catálogo entero
// por cada día.
//
// La deuda real está un nivel más abajo y queda anotada: el endpoint público
// devuelve las sesiones del estudio SIN cota de fecha (`fetchPublicStudioData`
// pagina la tabla entera). Acotarlo en servidor es trabajo de backend y no de
// esta pantalla; mientras tanto, el catálogo se comparte entre todas las vistas
// y se pide una sola vez.
export default function HorarioPage() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const [dia, setDia] = useState(hoyISO());
  const [filtro, setFiltro] = useState('Todo');

  const cargar = useCallback(async () => {
    const [clases, reservas, bonos, instructoras] = await Promise.all([
      getClases(estudio.slug), getReservas(estudio.slug), getBonos(estudio.slug), getInstructoras(estudio.slug),
    ]);
    return { clases, reservas, bonos, instructoras };
  }, [estudio.slug]);

  const { data, estado, reintentar } = useAsync(cargar, () => false);

  const tipos = useMemo(
    () => ['Todo', ...Array.from(new Set(data?.clases.map((c) => c.tipo) ?? [])), 'Con hueco'],
    [data],
  );

  const lista = (data?.clases ?? [])
    .filter((c) => c.fecha === dia)
    .filter((c) => filtro === 'Todo' || (filtro === 'Con hueco' ? c.plazasLibres > 0 : c.tipo === filtro))
    .sort((a, b) => a.hora.localeCompare(b.hora));

  const bono = data?.bonos.find((b) => b.estado === 'activo');

  return (
    <StudentShell>
      <PageHeader
        titulo="Horario"
        sub={estudio.nombre}
        accion={<Link href={href('/calendario')} className="btn btn--secondary btn--sm">Calendario</Link>}
      />

      <div style={{ marginTop: 14 }}>
        <DateSelector value={dia} onChange={setDia} />
      </div>

      <div className="px no-scrollbar" style={{ display: 'flex', gap: 7, overflowX: 'auto', marginTop: 10 }}>
        {tipos.map((t) => (
          <button key={t} type="button" className="pill" aria-pressed={filtro === t} onClick={() => setFiltro(t)} style={{ flexShrink: 0 }}>
            {t}
          </button>
        ))}
      </div>

      <p className="t-label px" style={{ margin: '12px 0 9px' }}>
        {estado === 'loading'
          ? 'Cargando…'
          : `${lista.length} ${lista.length === 1 ? 'clase' : 'clases'} · ${etiquetaDia(dia)}`}
      </p>

      <div className="px" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {estado === 'loading' && <ListSkeleton n={4} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && !data && <OfflineState />}

        {data && estado !== 'loading' && estado !== 'error' && (
          lista.length === 0 ? (
            <EmptyState
              icono="🔍"
              titulo={filtro === 'Todo' ? 'No hay clases este día' : `No hay ${filtro.toLowerCase()} este día`}
              cuerpo="Prueba otro día o quita el filtro."
              accion={filtro !== 'Todo' ? 'Quitar filtro' : undefined}
              onAccion={() => setFiltro('Todo')}
            />
          ) : (
            lista.map((c, i) => (
              <ClassCard
                key={c.id}
                clase={c}
                instructora={data.instructoras.find((x) => x.id === c.instructoraId)}
                estado={disponibilidad(c, data.reservas, estudio.soportaListaEspera)}
                conBono={Boolean(bono)}
                delay={i * 55}
              />
            ))
          )
        )}
      </div>
    </StudentShell>
  );
}

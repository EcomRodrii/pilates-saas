'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionStudent } from '@/lib/student/sesion';
import { useSesionInstructora } from '@/lib/student/sesion-instructora';
import { useAsync } from '@/lib/student/useAsync';
import { addDias, etiquetaDia, fechaLarga, hoyISO } from '@/lib/student/formato';
import { getAgendaInstructora, getClasesComoAlumna } from '@/lib/student/datos-instructora';
import { unirAgenda } from '@/lib/student/agenda-instructora';
import { agruparPorDia } from '@/lib/student/semana-instructora';
import { DateSelector } from '@/components/student/domain/DateSelector';
import { ClaseQueDaCard } from '@/components/student/domain/ClaseQueDaCard';
import { Badge } from '@/components/student/ui/Badge';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// Agenda de la instructora: las próximas dos semanas, TODAS seguidas, con la
// cabecera de cada día (decisión del 15-sep-2026). Antes enseñaba un solo día:
// con una clase al día la pantalla era una tarjeta y un hueco enorme, y para
// saber qué tenía el jueves había que ir tocando días. El selector de arriba
// ahora salta al día.
//
// AGENDA ÚNICA (decisión del 14-sep-2026, sin selector «Entrar como…»): si
// además es alumna del estudio, en la misma lista salen también las clases a
// las que viene, con su etiqueta. Así no se le esconde ninguna reserva.

const DIAS = 14;

/** Deja la cabecera de la app (56) y el selector de días a la vista al saltar. */
const MARGEN_SALTO = 'calc(56px + var(--safe-top) + 64px)';

function tituloDia(iso: string, hoy: string): string {
  const etiqueta = etiquetaDia(iso, hoy);
  const larga = fechaLarga(iso);
  // «Hoy · martes 15 de septiembre»; el resto, «Jueves 17 de septiembre».
  return etiqueta === 'Hoy' || etiqueta === 'Mañana'
    ? `${etiqueta} · ${larga}`
    : larga.charAt(0).toUpperCase() + larga.slice(1);
}

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

  // Con clave (lectura): volver a la agenda la pinta al momento y la refresca por
  // detrás. La forma cambia si además es alumna, así que va en la clave.
  const { data, estado, reintentar } = useAsync(cargar, () => false, `instr:${estudio.slug}:agenda:${hoy}:${esAlumna ? 'con-reservas' : 'solo-da'}`);
  const dias = agruparPorDia(data?.filas ?? [], (f) => f.clase.fecha, hoy, DIAS);
  const sinNada = Boolean(data) && dias.every((d) => d.filas.length === 0);

  const saltar = (iso: string) => {
    setDia(iso);
    document.getElementById(`dia-${iso}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <StudentShell modo="instructora">
      <PageHeader
        titulo="Agenda"
        sub={esAlumna ? 'Las clases que das y las que has reservado' : 'Tus clases de las próximas dos semanas'}
        // Solo si el estudio le deja crear sus clases: un botón que acaba en «no
        // puedes» es peor que no tenerlo.
        accion={data?.puedeCrearClases ? (
          <Link href={href('/equipo/nueva-clase')} className="btn btn--secondary btn--sm tap" data-testid="nueva-clase">
            Nueva clase
          </Link>
        ) : undefined}
      />
      {/* Pegado bajo la cabecera mientras se baja por la lista: es el índice de
          los días, y sin él había que volver arriba para saltar. */}
      <div style={{ position: 'sticky', top: 'calc(56px + var(--safe-top))', zIndex: 5, background: 'var(--background)', padding: '12px 0 8px' }}>
        <DateSelector value={dia} onChange={saltar} dias={DIAS} />
      </div>

      <div className="px stack" style={{ ['--gap' as string]: 'var(--s-5)', marginTop: 8 }}>
        {estado === 'loading' && <ListSkeleton n={3} h={96} />}
        {estado === 'error' && (
          <ErrorState cuerpo="No hemos podido cargar tu agenda. Tus clases siguen como estaban." onRetry={reintentar} />
        )}
        {estado === 'offline' && (
          <OfflineState cuerpo="Lo que ves es lo último que cargamos. Para ver cambios en tus clases necesitas conexión." />
        )}

        {sinNada && (
          <EmptyState
            ilustracion="calendario"
            titulo="No tienes clases en las próximas dos semanas"
            cuerpo="Cuando el estudio te asigne una, aparecerá aquí."
          />
        )}

        {data && !sinNada && dias.map((d) => (
          <section
            key={d.fecha}
            id={`dia-${d.fecha}`}
            className="stack"
            aria-labelledby={`titulo-dia-${d.fecha}`}
            style={{ ['--gap' as string]: 'var(--s-2)', scrollMarginTop: MARGEN_SALTO }}
          >
            <h2 id={`titulo-dia-${d.fecha}`} className="t-label">{tituloDia(d.fecha, hoy)}</h2>
            {d.filas.length === 0 ? (
              // Un día libre se ve libre, en una línea: no un hueco ni una
              // ilustración por cada día sin clase.
              <p className="t-small t-dim" style={{ margin: 0, padding: '10px 14px', border: '1px dashed var(--border)', borderRadius: 14 }}>
                Sin clases
              </p>
            ) : d.filas.map((f) => (f.tipo === 'da' ? (
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
                {/* La misma barra que las que da (`ClaseQueDaCard`), en neutro: sin
                    ella, en la misma lista las dos tarjetas no casaban. */}
                <span aria-hidden style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: 'var(--border-strong)', flexShrink: 0 }} />
                <div className="stack" style={{ ['--gap' as string]: 'var(--s-1)', minWidth: 0, flex: 1 }}>
                  <p className="t-meta">{f.clase.hora}{f.clase.sala ? ` · ${f.clase.sala}` : ''}</p>
                  <p className="t-card-title trunc">{f.clase.tipo}</p>
                </div>
                <Badge tone={f.clase.enEspera ? 'wait' : 'booked'}>{f.clase.enEspera ? 'En lista de espera' : 'Vienes a clase'}</Badge>
              </Link>
            )))}
          </section>
        ))}
      </div>
    </StudentShell>
  );
}

'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionInstructora } from '@/lib/student/sesion-instructora';
import { useAsync } from '@/lib/student/useAsync';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { addDias, etiquetaDia, fechaLarga, hoyISO, saludo } from '@/lib/student/formato';
import { getAgendaInstructora } from '@/lib/student/datos-instructora';
import { bajasEnCurso, proximaQueDa, textoBaja } from '@/lib/student/agenda-instructora';
import { ClaseQueDaCard } from '@/components/student/domain/ClaseQueDaCard';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// «Hoy» de la instructora: su próxima clase y el estado de las bajas que ha
// pedido. Es lo primero que ve al abrir la app del estudio con su cuenta.
//
// Solo lectura en esta fase: pedir la baja y marcar la disponibilidad llegan en
// el siguiente paso, reutilizando la lógica que ya existe en servidor.

/** Cuántos días mira hacia delante para encontrar su próxima clase. */
const DIAS_VISTA = 14;

export default function HoyInstructoraPage() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const { instructora } = useSesionInstructora(estudio.slug, true, true);
  // `null` hasta que hidrata: «la próxima» depende del reloj.
  const ahoraMs = useAhoraMs();
  const hoy = hoyISO();
  const hasta = addDias(hoy, DIAS_VISTA - 1);

  // ⚠️ Sin confirmar que es instructora no se pide nada. Esta pantalla monta
  // ANTES que su guardia —es su padre—, así que una alumna que llegue aquí por
  // un enlace dispararía la agenda (el servidor la rechaza, pero no tiene por
  // qué salir la petición). Mientras no se sabe, se queda en «cargando».
  const esInstructora = Boolean(instructora);
  const cargar = useCallback(
    () => (esInstructora ? getAgendaInstructora(estudio.slug, hoy, hasta) : new Promise<never>(() => {})),
    [esInstructora, estudio.slug, hoy, hasta],
  );
  const { data, estado, reintentar } = useAsync(cargar, () => false);

  const proxima = data && ahoraMs != null ? proximaQueDa(data.clases, ahoraMs) : null;
  const clasesHoy = (data?.clases ?? []).filter((c) => c.fecha === hoy && !c.cancelada).length;
  const bajas = bajasEnCurso(data?.bajas ?? []);
  const primerNombre = (instructora?.nombre ?? '').split(' ')[0];
  const fecha = fechaLarga(hoy);

  return (
    <StudentShell modo="instructora">
      <PageHeader titulo={saludo(primerNombre)} sub={fecha.charAt(0).toUpperCase() + fecha.slice(1)} />
      <div className="px stack" style={{ ['--gap' as string]: 'var(--s-5)', marginTop: 14 }}>
        {estado === 'loading' && <ListSkeleton n={2} h={96} />}
        {estado === 'error' && (
          <ErrorState cuerpo="No hemos podido cargar tu agenda. Tus clases siguen como estaban." onRetry={reintentar} />
        )}
        {estado === 'offline' && (
          <OfflineState cuerpo="Lo que ves es lo último que cargamos. Para ver cambios en tus clases necesitas conexión." />
        )}

        {data && (
          <>
            <section className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }} aria-labelledby="hoy-proxima">
              <h2 id="hoy-proxima" className="t-label">
                {clasesHoy > 0 ? `Hoy das ${clasesHoy} ${clasesHoy === 1 ? 'clase' : 'clases'}` : 'Tu próxima clase'}
              </h2>
              {proxima ? (
                <ClaseQueDaCard
                  clase={proxima}
                  conFecha={proxima.fecha === hoy ? undefined : etiquetaDia(proxima.fecha, hoy)}
                  href={href(`/equipo/clase/${encodeURIComponent(proxima.id)}`)}
                />
              ) : ahoraMs != null && (
                <EmptyState
                  ilustracion="calendario"
                  titulo={`No tienes clases en los próximos ${DIAS_VISTA} días`}
                  cuerpo="Cuando el estudio te asigne una, aparecerá aquí."
                />
              )}
            </section>

            {bajas.length > 0 && (
              <section className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }} aria-labelledby="hoy-bajas">
                <h2 id="hoy-bajas" className="t-label">Bajas que has pedido</h2>
                {bajas.map((b) => {
                  const t = textoBaja(b.estado, b.sustituta);
                  return (
                    <div
                      key={b.sustitucionId}
                      className="card stack"
                      role="status"
                      data-testid="baja-pedida"
                      style={{ ['--gap' as string]: '2px', padding: 'var(--s-4)' }}
                    >
                      <p className="t-meta">{etiquetaDia(b.fecha, hoy)} · {b.hora} · {b.tipo}</p>
                      <p className="t-card-title">{t.titulo}</p>
                      {t.detalle && <p className="t-small t-dim">{t.detalle}</p>}
                    </div>
                  );
                })}
              </section>
            )}

            <Link href={href('/equipo/agenda')} className="btn btn--secondary btn--full tap">
              Ver toda tu agenda
            </Link>
          </>
        )}
      </div>
    </StudentShell>
  );
}

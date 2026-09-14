'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionInstructora } from '@/lib/student/sesion-instructora';
import { useAsync } from '@/lib/student/useAsync';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { useOnline } from '@/lib/student/useOnline';
import { useToast } from '@/components/student/ui/Toast';
import { addDias, etiquetaDia, fechaLarga, hoyISO, saludo } from '@/lib/student/formato';
import { getAgendaInstructora, getOfertasInstructora, responderOferta } from '@/lib/student/datos-instructora';
import { bajasEnCurso, proximaQueDa, textoBaja, type OfertaSustitucion } from '@/lib/student/agenda-instructora';
import { textoRevision } from '@/lib/student/baja-instructora';
import { ClaseQueDaCard } from '@/components/student/domain/ClaseQueDaCard';
import { OfertaSustitucionCard } from '@/components/student/domain/OfertaSustitucionCard';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// «Hoy» de la instructora: lo que el estudio le pide cubrir, su próxima clase y
// el estado de las bajas que ha pedido. Es lo primero que ve al abrir la app del
// estudio con su cuenta.

/** Cuántos días mira hacia delante para encontrar su próxima clase. */
const DIAS_VISTA = 14;

export default function HoyInstructoraPage() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const router = useRouter();
  const { online } = useOnline();
  const { toast } = useToast();
  const { instructora } = useSesionInstructora(estudio.slug, true, true);
  // `null` hasta que hidrata: «la próxima» depende del reloj.
  const ahoraMs = useAhoraMs();
  const hoy = hoyISO();
  const hasta = addDias(hoy, DIAS_VISTA - 1);

  const [respondiendo, setRespondiendo] = useState<{ id: string; accion: 'aceptar' | 'rechazar' } | null>(null);
  const [errorOferta, setErrorOferta] = useState<{ id: string; texto: string } | null>(null);

  // ⚠️ Sin confirmar que es instructora no se pide nada. Esta pantalla monta
  // ANTES que su guardia —es su padre—, así que una alumna que llegue aquí por
  // un enlace dispararía la agenda (el servidor la rechaza, pero no tiene por
  // qué salir la petición). Mientras no se sabe, se queda en «cargando».
  const esInstructora = Boolean(instructora);
  const cargar = useCallback(async () => {
    if (!esInstructora) return new Promise<never>(() => {});
    const [agenda, ofertas] = await Promise.all([
      getAgendaInstructora(estudio.slug, hoy, hasta),
      // Si fallan las ofertas no se cae la agenda: la petición le llega también
      // por email, con su enlace.
      getOfertasInstructora(estudio.slug).catch((): OfertaSustitucion[] => []),
    ]);
    return { ...agenda, ofertas };
  }, [esInstructora, estudio.slug, hoy, hasta]);
  const { data, estado, reintentar, refrescar } = useAsync(cargar, () => false);

  const responder = async (oferta: OfertaSustitucion, accion: 'aceptar' | 'rechazar') => {
    if (respondiendo) return;
    // El estado de carga ANTES del await: que no se pueda pulsar dos veces.
    setRespondiendo({ id: oferta.sustitucionId, accion });
    setErrorOferta(null);
    const r = await responderOferta(estudio.slug, oferta.sustitucionId, accion);
    if (!r.ok && r.sesionCaducada) {
      setRespondiendo(null);
      router.push(href('/acceso/login'));
      return;
    }
    if (!r.ok && !r.motivo) {
      // No sabemos si llegó: la tarjeta se queda, con el porqué, para reintentar.
      setRespondiendo(null);
      setErrorOferta({ id: oferta.sustitucionId, texto: r.error });
      return;
    }
    // Haya valido o no («otra la cubrió antes»), lo que se enseña después es lo
    // que dice el servidor: se recarga.
    await refrescar();
    setRespondiendo(null);
    if (!r.ok) toast(r.error);
    else toast(accion === 'aceptar' ? 'La clase es tuya. Ya está en tu agenda.' : 'Gracias por avisar. Buscaremos a otra persona.');
  };

  const proxima = data && ahoraMs != null ? proximaQueDa(data.clases, ahoraMs) : null;
  const clasesHoy = (data?.clases ?? []).filter((c) => c.fecha === hoy && !c.cancelada).length;
  const bajas = bajasEnCurso(data?.bajas ?? [], ahoraMs);
  const ofertas = data?.ofertas ?? [];
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
            {ofertas.length > 0 && (
              <section className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }} aria-labelledby="hoy-ofertas">
                <h2 id="hoy-ofertas" className="t-label">
                  {ofertas.length === 1 ? 'Te piden cubrir esta clase' : `Te piden cubrir ${ofertas.length} clases`}
                </h2>
                {ofertas.map((o) => (
                  <OfertaSustitucionCard
                    key={o.sustitucionId}
                    oferta={o}
                    cuando={etiquetaDia(o.fecha, hoy)}
                    respondiendo={respondiendo?.id === o.sustitucionId ? respondiendo.accion : null}
                    error={errorOferta?.id === o.sustitucionId ? errorOferta.texto : null}
                    deshabilitada={!online || (respondiendo !== null && respondiendo.id !== o.sustitucionId)}
                    onResponder={(accion) => void responder(o, accion)}
                  />
                ))}
              </section>
            )}

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
                  const rev = textoRevision(b.revision ?? null);
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
                      {rev && <p className="t-small" style={{ fontWeight: 700, marginTop: 4 }}>{rev.titulo}</p>}
                      {rev?.nota && <p className="t-small t-dim">«{rev.nota}»</p>}
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

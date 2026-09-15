'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionInstructora } from '@/lib/student/sesion-instructora';
import { useAsync } from '@/lib/student/useAsync';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { useOnline } from '@/lib/student/useOnline';
import { useToast } from '@/components/student/ui/Toast';
import { addDias, etiquetaDia, fechaLarga, hoyISO, saludo } from '@/lib/student/formato';
import { getClases } from '@/lib/student/datos';
import { getAgendaInstructora, getOfertasInstructora, responderOferta } from '@/lib/student/datos-instructora';
import { bajasEnCurso, proximaQueDa, puedePasarLista, textoBaja, type OfertaSustitucion } from '@/lib/student/agenda-instructora';
import { textoRevision } from '@/lib/student/baja-instructora';
import { ClaseQueDaCard } from '@/components/student/domain/ClaseQueDaCard';
import { ProximaClaseQueDaCard } from '@/components/student/domain/ProximaClaseQueDaCard';
import { OfertaSustitucionCard } from '@/components/student/domain/OfertaSustitucionCard';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';
import { Foto, precargarFoto } from '@/components/student/ui/Foto';
import { Icono } from '@/components/student/ui/Icono';

// «Hoy» de la instructora: lo que el estudio le pide cubrir, su próxima clase y
// el estado de las bajas que ha pedido. Es lo primero que ve al abrir la app del
// estudio con su cuenta.
//
// Con la misma cara que el Inicio de la alumna: la portada del estudio con el
// saludo encima y la próxima clase en la tarjeta verde noche. Antes era un
// título y tarjetas blancas, y al lado de la app de la alumna parecía otra app.

/** Cuántos días mira hacia delante para encontrar su próxima clase. */
const DIAS_VISTA = 14;

// Lo leen el `<img>` y su precarga: si dijeran cosas distintas, la portada se
// bajaría dos veces.
const SIZES_PORTADA = '(min-width:1024px) 1040px, (min-width:768px) 640px, 100vw';

export default function HoyInstructoraPage() {
  const { estudio } = useEstudio();
  precargarFoto(estudio.fotoPortada, 640, SIZES_PORTADA);
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
    const [agenda, ofertas, catalogo] = await Promise.all([
      getAgendaInstructora(estudio.slug, hoy, hasta),
      // Si fallan las ofertas no se cae la agenda: la petición le llega también
      // por email, con su enlace.
      getOfertasInstructora(estudio.slug).catch((): OfertaSustitucion[] => []),
      // Solo para la foto de la próxima clase (el catálogo ya está en caché). Sin
      // él, la tarjeta sale en verde noche liso.
      getClases(estudio.slug).catch(() => []),
    ]);
    const fotos = new Map(catalogo.map((c) => [c.id, c.fotoUrl || null]));
    return { ...agenda, ofertas, fotos };
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
  const deHoy = (data?.clases ?? []).filter((c) => c.fecha === hoy && !c.cancelada);
  // El resto de las de hoy, debajo de la próxima: «Hoy das 3 clases» y enseñar
  // una sola obligaba a ir a la agenda para ver las otras dos.
  const otrasDeHoy = ahoraMs == null ? [] : deHoy.filter((c) => c.id !== proxima?.id && Date.parse(c.fin) > ahoraMs);
  const bajas = bajasEnCurso(data?.bajas ?? [], ahoraMs);
  const ofertas = data?.ofertas ?? [];
  const primerNombre = (instructora?.nombre ?? '').split(' ')[0];

  const resumen = !data ? null
    : ofertas.length > 0 ? (ofertas.length === 1 ? 'Te piden cubrir una clase' : `Te piden cubrir ${ofertas.length} clases`)
    : deHoy.length > 0 ? `Hoy das ${deHoy.length} ${deHoy.length === 1 ? 'clase' : 'clases'}`
    : 'Hoy no tienes clases';

  const enCurso = proxima != null && ahoraMs != null && Date.parse(proxima.inicio) <= ahoraMs;

  return (
    <StudentShell modo="instructora" headerTransparente conLema>
      {/* La portada del estudio, con la cabecera flotando encima. `background`:
          un estudio puede no haber subido portada, y sin tinta detrás el texto
          claro se pierde. */}
      <section style={{ position: 'relative', height: 268, overflow: 'hidden', background: '#0F0F0C' }}>
        <Foto
          src={estudio.fotoPortada}
          ancho={640}
          alto={268}
          sizes={SIZES_PORTADA}
          prioritaria
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 32%' }}
        />
        {/* Los mismos dos velos que el Inicio de la alumna, medidos allí sobre
            una foto de sala luminosa: el de arriba para la cabecera y el del
            bloque de texto para que se lea sea cual sea la portada. */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(185deg, rgba(8,8,8,.58), rgba(8,8,8,.18) 42%, rgba(8,8,8,.06) 58%, rgba(8,8,8,.03) 88%, rgba(8,8,8,0))' }} />
        <div
          className="px"
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, color: 'var(--on-dark)',
            paddingTop: 34, paddingBottom: 18,
            background: 'linear-gradient(to top, rgba(8,8,8,.74), rgba(8,8,8,.68) 46%, rgba(8,8,8,.60) 74%, rgba(8,8,8,.46) 92%, rgba(8,8,8,.14))',
          }}
        >
          <p className="t-label a-up" style={{ color: 'var(--on-dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {estudio.nombre} · {fechaLarga(hoy)}
          </p>
          <h1 className="a-up" style={{ margin: '8px 0 0', fontSize: 30, fontWeight: 800, letterSpacing: '-.035em', lineHeight: 1.06, animationDelay: '60ms' }}>
            {saludo(primerNombre)}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10, minHeight: 44 }}>
            <p className="a-up" style={{ margin: 0, fontSize: 'var(--t-body)', fontWeight: 600, color: 'rgba(250,249,245,.9)', animationDelay: '120ms' }}>
              {resumen}
            </p>
            <Link
              href={href('/equipo/agenda')}
              className="tap a-up"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0,
                height: 44, padding: '0 18px', borderRadius: 999,
                background: 'var(--on-dark)', color: 'var(--foreground)',
                fontSize: 'var(--t-small)', fontWeight: 800, animationDelay: '180ms',
              }}
            >
              Tu agenda
              <span aria-hidden style={{ display: 'flex' }}><Icono nombre="flecha-derecha" tamano={18} /></span>
            </Link>
          </div>
        </div>
      </section>

      <div className="px stack" style={{ ['--gap' as string]: 'var(--s-5)', marginTop: 16 }}>
        {estado === 'loading' && <ListSkeleton n={2} h={120} />}
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

            {proxima ? (
              <ProximaClaseQueDaCard
                clase={proxima}
                foto={data.fotos.get(proxima.id) ?? null}
                cuando={`${etiquetaDia(proxima.fecha, hoy)} · ${proxima.hora}`}
                enCurso={enCurso}
                hrefClase={href(`/equipo/clase/${encodeURIComponent(proxima.id)}`)}
                hrefLista={ahoraMs != null && puedePasarLista(proxima, ahoraMs)
                  ? href(`/equipo/clase/${encodeURIComponent(proxima.id)}/lista`)
                  : undefined}
              />
            ) : ahoraMs != null && (
              <EmptyState
                ilustracion="calendario"
                titulo={`No tienes clases en los próximos ${DIAS_VISTA} días`}
                cuerpo="Cuando el estudio te asigne una, aparecerá aquí."
              />
            )}

            {otrasDeHoy.length > 0 && (
              <section className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }} aria-labelledby="hoy-otras">
                <h2 id="hoy-otras" className="t-label">Más clases hoy</h2>
                {otrasDeHoy.map((c) => (
                  <ClaseQueDaCard key={c.id} clase={c} href={href(`/equipo/clase/${encodeURIComponent(c.id)}`)} />
                ))}
              </section>
            )}

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
          </>
        )}
      </div>
    </StudentShell>
  );
}

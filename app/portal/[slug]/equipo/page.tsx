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
import { agruparPorDia, cifraDuracion, lunesDe, resumenSemana } from '@/lib/student/semana-instructora';
import { ClaseQueDaCard } from '@/components/student/domain/ClaseQueDaCard';
import { ProximaClaseQueDaCard } from '@/components/student/domain/ProximaClaseQueDaCard';
import { OfertaSustitucionCard } from '@/components/student/domain/OfertaSustitucionCard';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';
import { Foto, precargarFoto } from '@/components/student/ui/Foto';
import { Icono } from '@/components/student/ui/Icono';

// «Hoy» de la instructora: lo que el estudio le pide cubrir, su próxima clase,
// su semana y el estado de las bajas que ha pedido. Es lo primero que ve al
// abrir la app del estudio con su cuenta.
//
// Con la misma cara que el Inicio de la alumna: la portada del estudio con el
// saludo encima y la próxima clase en la tarjeta verde noche. Y con su SEMANA
// (decisión del 15-sep-2026): con una clase al día la pantalla era una tarjeta y
// un hueco, y lo que de verdad quiere saber al abrirla —cuánto trabaja esta
// semana y qué tiene los próximos días— estaba escondido en la agenda.

/** Cuántos días mira hacia delante para encontrar su próxima clase. */
const DIAS_VISTA = 14;
/** «Próximos días»: los que siguen a hoy, sin llegar a ser la agenda entera. */
const DIAS_PROXIMOS = 6;

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
  // El primitivo fuera: con `estudio.slug` en las dependencias el React Compiler
  // no puede conservar la memoización (ver react-compiler-memoizacion-manual).
  const slug = estudio.slug;

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
      // Desde el LUNES y no desde hoy: el resumen cuenta la semana entera, también
      // las clases que ya dio (cabe de sobra en el tope de la agenda, 31 días).
      getAgendaInstructora(slug, lunesDe(hoy), addDias(hoy, DIAS_VISTA - 1)),
      // Si fallan las ofertas no se cae la agenda: la petición le llega también
      // por email, con su enlace.
      getOfertasInstructora(slug).catch((): OfertaSustitucion[] => []),
      // Solo para la foto de la próxima clase (el catálogo ya está en caché). Sin
      // él, la tarjeta sale en verde noche liso.
      getClases(slug).catch(() => []),
    ]);
    const fotos = new Map(catalogo.map((c) => [c.id, c.fotoUrl || null]));
    return { ...agenda, ofertas, fotos };
  }, [esInstructora, slug, hoy]);
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

  const clases = data?.clases ?? [];
  const proxima = data && ahoraMs != null ? proximaQueDa(clases, ahoraMs) : null;
  const deHoy = clases.filter((c) => c.fecha === hoy && !c.cancelada);
  // El resto de las de hoy, debajo de la próxima: «Hoy das 3 clases» y enseñar
  // una sola obligaba a ir a la agenda para ver las otras dos.
  const otrasDeHoy = ahoraMs == null ? [] : deHoy.filter((c) => c.id !== proxima?.id && Date.parse(c.fin) > ahoraMs);
  const proximosDias = agruparPorDia(
    clases.filter((c) => !c.cancelada && c.id !== proxima?.id),
    (c) => c.fecha, addDias(hoy, 1), DIAS_PROXIMOS,
  ).filter((d) => d.filas.length > 0);
  const semana = resumenSemana(clases, hoy, ahoraMs);
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
        {estado === 'loading' && <ListSkeleton n={3} h={110} />}
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

            {/* Su semana en tres cifras. Todas salen de SUS clases de lunes a
                domingo: no se estima nada, así que ninguna puede mentir. */}
            <section aria-labelledby="hoy-semana" data-testid="resumen-semana">
              <h2 id="hoy-semana" className="t-label" style={{ margin: '0 0 7px' }}>Tu semana</h2>
              <div className="card" style={{ padding: '14px 6px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                <Cifra valor={String(semana.clases)} texto={semana.clases === 1 ? 'clase' : 'clases'}
                  detalle={semana.clases > 0 && semana.quedan < semana.clases ? `quedan ${semana.quedan}` : undefined} />
                <Cifra {...cifraDuracion(semana.minutos)} separador />
                <Cifra valor={String(semana.plazasOcupadas)} texto={semana.plazasOcupadas === 1 ? 'plaza ocupada' : 'plazas ocupadas'} separador />
              </div>
            </section>

            {otrasDeHoy.length > 0 && (
              <section className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }} aria-labelledby="hoy-otras">
                <h2 id="hoy-otras" className="t-label">Más clases hoy</h2>
                {otrasDeHoy.map((c) => (
                  <ClaseQueDaCard key={c.id} clase={c} href={href(`/equipo/clase/${encodeURIComponent(c.id)}`)} />
                ))}
              </section>
            )}

            {proximosDias.length > 0 && (
              <section className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }} aria-labelledby="hoy-proximos">
                <h2 id="hoy-proximos" className="t-label">Próximos días</h2>
                {proximosDias.flatMap((d) => d.filas.map((c) => (
                  <ClaseQueDaCard
                    key={c.id}
                    clase={c}
                    conFecha={etiquetaDia(d.fecha, hoy)}
                    href={href(`/equipo/clase/${encodeURIComponent(c.id)}`)}
                  />
                )))}
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

function Cifra({ valor, texto, detalle, separador = false }: { valor: string; texto: string; detalle?: string; separador?: boolean }) {
  return (
    <div style={{ padding: '0 10px', textAlign: 'center', minWidth: 0, borderLeft: separador ? '1px solid var(--border)' : undefined }}>
      <p className="t-num" style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.1 }}>{valor}</p>
      <p className="t-meta" style={{ margin: '3px 0 0' }}>{texto}</p>
      {detalle && <p className="t-meta" style={{ margin: '1px 0 0', color: 'var(--subtle-foreground)' }}>{detalle}</p>}
    </div>
  );
}

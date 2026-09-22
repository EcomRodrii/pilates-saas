'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { useOnline } from '@/lib/student/useOnline';
import { useToast } from '@/components/student/ui/Toast';
import { getClasesFijas } from '@/lib/student/datos';
import { ampliarClaseFija, anularPeticionClaseFija, pedirClaseFija } from '@/lib/student/clases-fijas-datos';
import { anularPeticionPlazaFija, pedirPlazaFija } from '@/lib/student/plaza-fija-peticion';
import { diasDeLaOferta, type ClaseFijaVista, type ClaseSueltaVista } from '@/lib/student/clases-fijas';
import { TEXTOS_CLASES_FIJAS as T } from '@/lib/student/clases-fijas-textos';
import { TEXTOS_PLAZA_FIJA as TPF } from '@/lib/student/plaza-fija-textos';
import { nombreDia } from '@/lib/student/plaza-fija';
import { fechaDMY } from '@/lib/series-renovacion';
import { Badge } from '@/components/student/ui/Badge';
import { Button } from '@/components/student/ui/Button';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// Clases fijas del estudio: lo que la alumna ve para pedir una, con qué clases
// incluye y cuánto tiempo la quiere. Pedirla NO la reserva: el estudio la aprueba
// (`solicitudes_plaza_fija`, tipo CREAR_CLASE_FIJA) y su respuesta llega a la app.
//
// ⚠️ No decide nada. Si le queda sitio, si su cuota la cubre y hasta qué fecha llega
// cada duración lo dice el servidor; el estado de «pedida» se pinta desde lo que el
// servidor devolvió, nunca de forma optimista.
export default function ClasesFijasPage() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const { online } = useOnline();
  const cargar = useCallback(() => getClasesFijas(estudio.slug).then((r) => (r ?? Promise.reject(new Error('sin datos')))), [estudio.slug]);
  const { data, estado, reintentar, refrescar } = useAsync(cargar, (d) => d.ofertas.length === 0 && d.sueltas.length === 0);

  return (
    <StudentShell>
      <PageHeader titulo={T.titulo} sub={T.sub} back />
      <p className="px t-meta" style={{ marginTop: 10 }}>{T.comoFunciona}</p>

      <div className="px" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
        {estado === 'loading' && <ListSkeleton n={2} h={180} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && !data && <OfflineState />}
        {data && estado !== 'loading' && estado !== 'error' && (
          data.ofertas.length === 0 && data.sueltas.length === 0 ? (
            <EmptyState ilustracion="postura" titulo={T.vacio} accion="Ver el horario" href={href('/reservar')} />
          ) : (
            <>
              {data.ofertas.map((c) => (
                <TarjetaClaseFija key={c.id} c={c} studioId={estudio.id} slug={estudio.slug} online={online} onCambio={refrescar} />
              ))}
              {data.sueltas.length > 0 && (
                <>
                  {data.ofertas.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <p className="t-label" style={{ margin: 0 }}>{T.sueltasTitulo}</p>
                      <p className="t-meta" style={{ margin: '2px 0 0' }}>{T.sueltasCuerpo}</p>
                    </div>
                  )}
                  {data.sueltas.map((f) => (
                    <TarjetaSuelta key={`${f.serieId}-${f.diaSemana}`} f={f} studioId={estudio.id} slug={estudio.slug} online={online} onCambio={refrescar} />
                  ))}
                </>
              )}
            </>
          )
        )}
      </div>
    </StudentShell>
  );
}

function TarjetaSuelta({ f, studioId, slug, online, onCambio }: {
  f: ClaseSueltaVista; studioId: string; slug: string; online: boolean; onCambio: () => void;
}) {
  const { toast } = useToast();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  async function pedir() {
    if (f.estado.estado !== 'PUEDE_PEDIR' || enviando) return;
    setEnviando(true);
    setError('');
    const r = await pedirPlazaFija(slug, studioId, f.proximaSesionId);
    setEnviando(false);
    if (!r.ok) { setError(r.error); return; }
    toast(TPF.pedida);
    onCambio();
  }

  async function anular() {
    if (f.estado.estado !== 'PEDIDA' || enviando) return;
    setEnviando(true);
    setError('');
    const r = await anularPeticionPlazaFija(slug, studioId, f.estado.peticionId);
    setEnviando(false);
    if (!r.ok) { setError(r.error); return; }
    toast(TPF.botonAnular);
    onCambio();
  }

  return (
    <article data-testid="clase-suelta" aria-label={`${nombreDia(f.diaSemana)} ${f.hora}`} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 'var(--t-h3, 1.05rem)', fontWeight: 800, textTransform: 'capitalize' }}>{nombreDia(f.diaSemana)} {f.hora}</h2>
          <p className="t-meta" style={{ marginTop: 2 }}>{f.tipo}{f.sala ? ` · ${f.sala}` : ''}{f.instructora ? ` · con ${f.instructora}` : ''}</p>
        </div>
        {f.estado.estado === 'TIENE_PLAZA' ? <Badge tone="booked">La tienes ✓</Badge>
          : f.estado.estado === 'PEDIDA' ? <Badge tone="wait">Pedida</Badge>
          : null}
      </div>

      {f.estado.estado === 'PEDIDA' ? (
        <>
          <p role="status" data-testid="clase-suelta-pedida" style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 700 }}>{TPF.pedida}</p>
          <Button variant="secondary" size="sm" loading={enviando} disabled={!online} onClick={() => void anular()}>{TPF.botonAnular}</Button>
        </>
      ) : f.estado.estado === 'TIENE_PLAZA' ? null : f.estado.estado === 'SOLO_CON_CUOTA' ? (
        <div data-testid="clase-suelta-sin-cuota">
          <p style={{ margin: 0, fontSize: 'var(--t-small)' }}>{TPF.soloConCuota}</p>
        </div>
      ) : (
        <>
          <p className="t-meta" style={{ margin: 0 }}>{TPF.ofrecer(f.diaSemana, f.hora)}</p>
          <Button size="sm" loading={enviando} disabled={!online} onClick={() => void pedir()}>{TPF.botonPedir}</Button>
        </>
      )}

      {error && <p role="alert" style={{ margin: 0, fontSize: 'var(--t-small)', color: 'var(--danger, #b00020)', fontWeight: 700 }}>{error}</p>}
    </article>
  );
}

function TarjetaClaseFija({ c, studioId, slug, online, onCambio }: {
  c: ClaseFijaVista; studioId: string; slug: string; online: boolean; onCambio: () => void;
}) {
  const { toast } = useToast();
  const href = usePortalHref();
  const [meses, setMeses] = useState<number>(c.duraciones[0]?.meses ?? 0);
  const [mesesAmpliar, setMesesAmpliar] = useState<number>(c.duraciones[0]?.meses ?? 0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const elegida = c.duraciones.find((d) => d.meses === meses) ?? c.duraciones[0];
  const elegidaAmpliar = c.duraciones.find((d) => d.meses === mesesAmpliar) ?? c.duraciones[0];

  const puedePedir = c.estado === 'DISPONIBLE' && c.tieneCuota && (c.estadoAlumna === 'LIBRE' || c.estadoAlumna === 'PARCIAL') && !!elegida;
  // Ya la tiene entera, le queda poco y no ha pedido ya ampliarla: solo entonces se ofrece.
  // `c.terminaPronto` viene calculado de `proyectarClasesFijas` (con el `hoy` del servidor/catálogo),
  // no de una llamada propia aquí — ver el comentario en `ClaseFijaVista`.
  const pronto = c.estadoAlumna === 'LA_TIENE' && c.terminaPronto;
  const puedeAmpliar = pronto && !c.ampliacionPedida && !!elegidaAmpliar;

  async function pedir() {
    if (!puedePedir || enviando || !elegida) return;
    setEnviando(true);
    setError('');
    const r = await pedirClaseFija(slug, studioId, c.id, elegida.meses);
    setEnviando(false);
    if (!r.ok) { setError(r.error); return; }
    toast(r.resuelta && r.mensaje ? r.mensaje : T.enviada);
    onCambio();
  }

  async function anular() {
    if (!c.pedida || enviando) return;
    setEnviando(true);
    setError('');
    const r = await anularPeticionClaseFija(slug, studioId, c.pedida.solicitudId);
    setEnviando(false);
    if (!r.ok) { setError(r.error); return; }
    toast(T.anulada);
    onCambio();
  }

  async function ampliar() {
    if (!puedeAmpliar || enviando || !elegidaAmpliar) return;
    setEnviando(true);
    setError('');
    const r = await ampliarClaseFija(slug, studioId, c.id, elegidaAmpliar.meses);
    setEnviando(false);
    if (!r.ok) { setError(r.error); return; }
    toast(r.resuelta && r.mensaje ? r.mensaje : T.ampliacionEnviada);
    onCambio();
  }

  async function anularAmpliacion() {
    if (!c.ampliacionPedida || enviando) return;
    setEnviando(true);
    setError('');
    const r = await anularPeticionClaseFija(slug, studioId, c.ampliacionPedida.solicitudId);
    setEnviando(false);
    if (!r.ok) { setError(r.error); return; }
    toast(T.ampliacionAnulada);
    onCambio();
  }

  return (
    <article data-testid="clase-fija" aria-label={c.nombre} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 'var(--t-h3, 1.05rem)', fontWeight: 800 }}>{c.nombre}</h2>
          <p className="t-meta" style={{ marginTop: 2 }}>Los {diasDeLaOferta(c.franjas)}</p>
        </div>
        {c.estadoAlumna === 'LA_TIENE' ? <Badge tone="booked">La tienes ✓</Badge>
          : c.estadoAlumna === 'PEDIDA' ? <Badge tone="wait">Pedida</Badge>
          : c.estado === 'COMPLETA' ? <Badge tone="full">Completa</Badge>
          : null}
      </div>

      {c.descripcion && <p style={{ margin: 0, fontSize: 'var(--t-body)' }}>{c.descripcion}</p>}

      <div>
        <p className="t-label" style={{ marginBottom: 6 }}>{T.incluye}</p>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {c.franjas.map((f) => (
            <li key={`${f.diaSemana}-${f.hora}-${f.tipoClaseId}`} style={{ fontSize: 'var(--t-small)' }}>
              <strong style={{ textTransform: 'capitalize' }}>{nombreDia(f.diaSemana)} {f.hora}</strong>
              <span className="t-meta"> · {f.tipo}{f.sala ? ` · ${f.sala}` : ''}{f.instructora ? ` · con ${f.instructora}` : ''}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="t-meta" style={{ margin: 0 }}>
        {c.estado === 'DISPONIBLE' && c.plazasLibres !== null ? `${T.plazasLibres(Math.max(0, c.plazasLibres))}` : ''}
        {c.estado === 'DISPONIBLE' && c.plazasLibres !== null && c.programadaHasta ? ' · ' : ''}
        {c.programadaHasta ? T.hayClasesHasta(fechaDMY(c.programadaHasta)) : ''}
      </p>

      {c.estadoAlumna === 'PARCIAL' && <p style={{ margin: 0, fontSize: 'var(--t-small)' }}>{T.parcial}</p>}
      {c.estado === 'SIN_CLASES' && <p style={{ margin: 0, fontSize: 'var(--t-small)' }}>{T.sinClases}</p>}
      {c.estado === 'COMPLETA' && c.estadoAlumna !== 'LA_TIENE' && <p style={{ margin: 0, fontSize: 'var(--t-small)' }}>{T.completa}</p>}

      {c.estadoAlumna === 'PEDIDA' && c.pedida ? (
        <>
          <p role="status" data-testid="clase-fija-pedida" style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 700 }}>{T.pedida(fechaDMY(c.pedida.hasta))}</p>
          <Button variant="secondary" size="sm" loading={enviando} disabled={!online} onClick={() => void anular()}>{T.botonAnular}</Button>
        </>
      ) : c.estadoAlumna === 'LA_TIENE' ? (
        <>
          <p role="status" style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 700 }}>{T.laTiene}</p>
          {c.venceEl && <p className="t-meta" data-testid="clase-fija-vence" style={{ margin: 0 }}>{T.venceEl(fechaDMY(c.venceEl))}</p>}
          {c.ampliacionPedida ? (
            <>
              <p role="status" data-testid="clase-fija-ampliacion-pedida" style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 700 }}>
                {T.ampliacionPedida(fechaDMY(c.ampliacionPedida.hasta))}
              </p>
              <Button variant="secondary" size="sm" loading={enviando} disabled={!online} onClick={() => void anularAmpliacion()}>{T.botonAnular}</Button>
            </>
          ) : pronto ? (
            <>
              <p role="status" className="note note--warn" data-testid="clase-fija-termina-pronto" style={{ margin: 0 }}>{T.terminaProntoAviso}</p>
              <div>
                <p className="t-label" style={{ marginBottom: 6 }}>{T.cuantoTiempoAmpliar}</p>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }} role="group" aria-label={T.cuantoTiempoAmpliar}>
                  {c.duraciones.map((d) => (
                    <button key={d.meses} type="button" className="pill" aria-pressed={d.meses === mesesAmpliar} onClick={() => setMesesAmpliar(d.meses)}>
                      {d.etiqueta}
                    </button>
                  ))}
                </div>
              </div>
              <Button full loading={enviando} disabled={!online || !puedeAmpliar} onClick={() => void ampliar()}>{T.botonAmpliar}</Button>
            </>
          ) : null}
        </>
      ) : c.estado === 'DISPONIBLE' ? (
        c.tieneCuota ? (
          <>
            <div>
              <p className="t-label" style={{ marginBottom: 6 }}>{T.cuantoTiempo}</p>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }} role="group" aria-label={T.cuantoTiempo}>
                {c.duraciones.map((d) => (
                  <button key={d.meses} type="button" className="pill" aria-pressed={d.meses === meses} onClick={() => setMeses(d.meses)}>
                    {d.etiqueta}
                  </button>
                ))}
              </div>
              {elegida && <p className="t-meta" data-testid="clase-fija-hasta" style={{ marginTop: 6 }}>{T.hastaEl(fechaDMY(elegida.hasta))}</p>}
            </div>
            <Button full loading={enviando} disabled={!online || !puedePedir} onClick={() => void pedir()}>{T.botonPedir}</Button>
          </>
        ) : (
          <div data-testid="clase-fija-sin-cuota">
            <p style={{ margin: 0, fontSize: 'var(--t-small)' }}>{T.sinCuota}</p>
            <Link href={href('/comprar')} className="btn btn--secondary btn--sm" style={{ marginTop: 8, display: 'inline-flex' }}>Ver las cuotas</Link>
          </div>
        )
      ) : null}

      {error && <p role="alert" style={{ margin: 0, fontSize: 'var(--t-small)', color: 'var(--danger, #b00020)', fontWeight: 700 }}>{error}</p>}
    </article>
  );
}

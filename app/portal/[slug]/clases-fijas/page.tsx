'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { useOnline } from '@/lib/student/useOnline';
import { useToast } from '@/components/student/ui/Toast';
import { getClasesFijas } from '@/lib/student/datos';
import { ampliarClaseFija, anularPeticionClaseFija, pedirClaseFija } from '@/lib/student/clases-fijas-datos';
import { diasDeLaOferta, type ClaseFijaVista, type ClaseSueltaVista } from '@/lib/student/clases-fijas';
import { FRANJAS_HORARIAS, franjaHorariaDe } from '@/lib/clases-fijas-reglas';
import { TEXTOS_CLASES_FIJAS as T } from '@/lib/student/clases-fijas-textos';
import { TEXTOS_PLAZA_FIJA as TPF } from '@/lib/student/plaza-fija-textos';
import { nombreDia } from '@/lib/student/plaza-fija';
import { fechaDMY } from '@/lib/series-renovacion';
import { Badge } from '@/components/student/ui/Badge';
import { Button } from '@/components/student/ui/Button';
import { Icono } from '@/components/student/ui/Icono';
import { ClaseFijaCard } from '@/components/student/domain/ClaseFijaCard';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

/** Ignora acentos y mayúsculas: mismo criterio que la búsqueda del horario (`reservar/page.tsx`). */
const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** El logo del tipo de clase, si tiene — mismo look que la ficha de una clase, a menor tamaño para una fila. */
function LogoTipo({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <span
      aria-hidden data-testid="logo-tipo-clase"
      style={{ display: 'block', flexShrink: 0, width: 32, height: 32, borderRadius: 9, background: `url(${url}) center/cover`, border: '1px solid var(--border)' }}
    />
  );
}

/** Pista de que la fila abre la ficha de la clase. Decorativa: el nombre accesible va en el enlace. */
function Chevron() {
  return (
    <span aria-hidden style={{ display: 'flex', flexShrink: 0, color: 'var(--subtle-foreground)' }}>
      <Icono nombre="chevron-derecha" tamano={16} />
    </span>
  );
}

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

  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('Todo');
  const [hora, setHora] = useState('Todo');

  // Los tipos que de verdad hay que ofrecer: solo los que aparecen en alguna
  // oferta u suelta, no el catálogo entero del estudio (un tipo sin ninguna
  // clase fija sería una píldora que siempre vacía la lista).
  const tipos = useMemo(() => ['Todo', ...new Set([
    ...(data?.ofertas.flatMap((o) => o.franjas.map((f) => f.tipo)) ?? []),
    ...(data?.sueltas.map((f) => f.tipo) ?? []),
  ])], [data]);
  const tipoReal = tipos.includes(tipo) ? tipo : 'Todo';

  // Mismo criterio que `tipos`: solo los momentos del día que de verdad tienen
  // alguna clase fija, en el orden del día (no el orden en que aparecen).
  const horas = useMemo(() => ['Todo', ...FRANJAS_HORARIAS.filter((fh) =>
    (data?.ofertas.some((o) => o.franjas.some((f) => franjaHorariaDe(f.hora) === fh)) ?? false)
    || (data?.sueltas.some((f) => franjaHorariaDe(f.hora) === fh) ?? false))], [data]);
  const horaReal = horas.includes(hora) ? hora : 'Todo';

  const consulta = normalizar(q.trim());
  const coincide = (textos: (string | null)[]) => !consulta || textos.some((t) => t && normalizar(t).includes(consulta));

  const ofertas = (data?.ofertas ?? [])
    .filter((o) => tipoReal === 'Todo' || o.franjas.some((f) => f.tipo === tipoReal))
    .filter((o) => horaReal === 'Todo' || o.franjas.some((f) => franjaHorariaDe(f.hora) === horaReal))
    .filter((o) => coincide([o.nombre, o.descripcion, ...o.franjas.flatMap((f) => [f.tipo, f.sala, f.instructora])]));
  const sueltas = (data?.sueltas ?? [])
    .filter((f) => tipoReal === 'Todo' || f.tipo === tipoReal)
    .filter((f) => horaReal === 'Todo' || franjaHorariaDe(f.hora) === horaReal)
    .filter((f) => coincide([f.tipo, f.sala, f.instructora, nombreDia(f.diaSemana)]));

  // Distingue «tu estudio no tiene ninguna» (EmptyState, con salida al horario)
  // de «las tuyas están filtradas» (se queda el buscador para poder quitarlo).
  const hayAlgo = (data?.ofertas.length ?? 0) > 0 || (data?.sueltas.length ?? 0) > 0;
  const total = (data?.ofertas.length ?? 0) + (data?.sueltas.length ?? 0);
  // El buscador ayuda a partir de unas pocas; con 1-3 no hay nada que «apelotone».
  // Cada fila de píldoras solo si hay más de una opción real que elegir (sin contar «Todo»).
  const conBuscador = total > 3;
  const conFiltrosTipo = tipos.length > 2;
  const conFiltrosHora = horas.length > 2;

  return (
    <StudentShell>
      <PageHeader titulo={T.titulo} sub={T.sub} back />
      <p className="px t-meta" style={{ marginTop: 10 }}>{T.comoFunciona}</p>

      {data && hayAlgo && conBuscador && (
        <>
          <div className="px" style={{ marginTop: 12 }}>
            <div style={{ position: 'relative' }}>
              <span aria-hidden style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--subtle-foreground)', display: 'flex' }}>
                <Icono nombre="buscar" tamano={18} />
              </span>
              <input
                type="search" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar clases fijas…" aria-label="Buscar clases fijas"
                style={{ width: '100%', height: 44, paddingLeft: 40, paddingRight: q ? 40 : 14, border: '1px solid var(--border)', borderRadius: 999, background: 'var(--card)', fontSize: 'var(--t-body)', fontFamily: 'inherit', color: 'var(--foreground)' }}
              />
              {q && (
                <button type="button" onClick={() => setQ('')} aria-label="Borrar búsqueda"
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, borderRadius: 999, border: 'none', background: 'var(--muted)', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icono nombre="cerrar" tamano={16} />
                </button>
              )}
            </div>
          </div>
          {conFiltrosTipo && (
            <div className="px no-scrollbar" data-testid="filtros-tipo" aria-label="Filtrar por tipo de clase" style={{ display: 'flex', gap: 7, overflowX: 'auto', marginTop: 10 }}>
              {tipos.map((t) => (
                <button key={t} type="button" className="pill" aria-pressed={tipoReal === t} onClick={() => setTipo(t)} style={{ flexShrink: 0 }}>
                  {t}
                </button>
              ))}
            </div>
          )}
          {conFiltrosHora && (
            <div className="px no-scrollbar" data-testid="filtros-hora" aria-label="Filtrar por hora" style={{ display: 'flex', gap: 7, overflowX: 'auto', marginTop: 7 }}>
              {horas.map((h) => (
                <button key={h} type="button" className="pill" aria-pressed={horaReal === h} onClick={() => setHora(h)} style={{ flexShrink: 0 }}>
                  {h}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <div className="px" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
        {estado === 'loading' && <ListSkeleton n={2} h={180} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && !data && <OfflineState />}
        {data && estado !== 'loading' && estado !== 'error' && (
          !hayAlgo ? (
            <EmptyState ilustracion="postura" titulo={T.vacio} accion="Ver el horario" href={href('/reservar')} />
          ) : ofertas.length === 0 && sueltas.length === 0 ? (
            <p className="t-meta" style={{ textAlign: 'center', padding: '20px 0' }}>{T.sinResultados}</p>
          ) : (
            <>
              {ofertas.map((c) => (
                <TarjetaClaseFija key={c.id} c={c} studioId={estudio.id} slug={estudio.slug} online={online} onCambio={refrescar} />
              ))}
              {sueltas.length > 0 && (
                <ListaSueltas sueltas={sueltas} conOfertas={ofertas.length > 0} />
              )}
            </>
          )
        )}
      </div>
    </StudentShell>
  );
}

/**
 * Las clases que se repiten sin oferta con nombre, como en el horario: una
 * tarjeta por clase (`ClaseFijaCard`, el mismo aspecto que una clase del
 * horario) y agrupadas por día. Tocar la tarjeta abre la ficha de su próxima
 * clase, que es donde se pide la clase fija — aquí no hay un botón por fila:
 * con 39 clases eran 39 botones iguales.
 */
function ListaSueltas({ sueltas, conOfertas }: { sueltas: ClaseSueltaVista[]; conOfertas: boolean }) {
  const dias = [...new Set(sueltas.map((f) => f.diaSemana))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  return (
    <section data-testid="clases-sueltas" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {conOfertas && (
        <div>
          <p className="t-label" style={{ margin: 0 }}>{T.sueltasTitulo}</p>
          <p className="t-meta" style={{ margin: '2px 0 0' }}>{T.sueltasCuerpo}</p>
        </div>
      )}
      {sueltas.some((f) => f.estado.estado === 'PUEDE_PEDIR') && (
        <p className="t-meta" style={{ margin: 0 }}>{T.tocaParaPedir}</p>
      )}
      {dias.map((d) => {
        const delDia = sueltas.filter((f) => f.diaSemana === d);
        return (
          <div key={d} data-testid="dia-clases-fijas" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <h2 className="t-label" style={{ margin: 0 }}>{T.cabeceraDia(nombreDia(d), delDia.length)}</h2>
            {delDia.map((f, i) => <ClaseFijaCard key={`${f.serieId}-${f.diaSemana}`} f={f} delay={Math.min(i, 6) * 45} />)}
          </div>
        );
      })}
      {/* Por qué alguna dice «Necesita cuota»: UNA vez, no en cada tarjeta. */}
      {sueltas.some((f) => f.estado.estado === 'SOLO_CON_CUOTA') && (
        <p data-testid="clase-suelta-sin-cuota" className="t-meta" style={{ margin: 0 }}>{TPF.soloConCuota}</p>
      )}
    </section>
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
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {c.franjas.map((f) => (
            <li key={`${f.diaSemana}-${f.hora}-${f.tipoClaseId}`}>
              <Link
                href={href('/reservar/' + f.proximaSesionId)} data-testid="clase-fija-franja"
                aria-label={`Ver la clase del ${nombreDia(f.diaSemana)} a las ${f.hora}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--t-small)', color: 'inherit' }}
              >
                <LogoTipo url={f.logoUrl} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ textTransform: 'capitalize' }}>{nombreDia(f.diaSemana)} {f.hora}</strong>
                  <span className="t-meta"> · {f.tipo}{f.sala ? ` · ${f.sala}` : ''}{f.instructora ? ` · con ${f.instructora}` : ''}</span>
                </span>
                <Chevron />
              </Link>
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
